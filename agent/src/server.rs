use alloy::primitives::Address;
use anyhow::{Context, bail};
use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use serde_json::{Value, json};
use std::sync::Arc;

use crate::{approval, events, killswitch, wallet::WalletClient};

struct AppState {
    wallet: WalletClient,
    token: String,
}

type ApiError = (StatusCode, String);

pub async fn run(wallet: WalletClient) -> anyhow::Result<()> {
    let token = std::env::var("DASHBOARD_TOKEN").context("DASHBOARD_TOKEN is not set")?;
    if token.len() < 24 {
        bail!("DASHBOARD_TOKEN must be at least 24 characters");
    }
    let state = Arc::new(AppState { wallet, token });

    let app = Router::new()
        .route("/status", get(status))
        .route("/events", get(list_events))
        .route("/pause", post(pause))
        .route("/resume", post(resume))
        .route("/approvals", get(list_approvals))
        .route("/approvals/{id}/{action}", post(answer_approval))
        .with_state(state);

    let port = std::env::var("AGENT_API_PORT").unwrap_or_else(|_| "4030".into());
    let addr = format!("127.0.0.1:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    println!("agent API listening on http://{addr}");
    axum::serve(listener, app).await?;
    Ok(())
}

fn authorize(s: &AppState, h: &HeaderMap) -> Result<(), ApiError> {
    let expected = format!("Bearer {}", s.token);
    let ok = h
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v == expected);
    if ok {
        Ok(())
    } else {
        Err((StatusCode::UNAUTHORIZED, "missing or wrong token".into()))
    }
}

fn internal(e: anyhow::Error) -> ApiError {
    (StatusCode::INTERNAL_SERVER_ERROR, format!("{e:#}"))
}

fn num(s: &str) -> f64 {
    s.parse::<f64>().unwrap_or(0.0)
}

async fn status(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize(&s, &headers)?;
    let w = &s.wallet;

    let registered = w.registered_agent().await.map_err(internal)?;
    let p = w.policy().await.map_err(internal)?;
    let state = if registered != w.agent_address {
        "revoked"
    } else if p.agent_expired {
        "expired"
    } else if killswitch::is_active() {
        "paused"
    } else {
        "active"
    };

    let p = w.policy().await.map_err(internal)?;
    Ok(Json(json!({
        "status": state,
        "wallet": w.wallet_address.to_string(),
        "agentAddress": w.agent_address.to_string(),
        "walletUsdc": num(&w.usdc_balance().await.map_err(internal)?),
        "agentGasEth": num(&w.agent_gas_balance().await.map_err(internal)?),
        "maxPerTx": num(&p.max_per_tx),
        "maxPerDay": num(&p.max_per_day),
        "remainingToday": num(&p.remaining_today),
        "agentExpiresInHours": p.agent_expires_in_hours,
    })))
}

async fn list_events(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Vec<events::Event>>, ApiError> {
    authorize(&s, &headers)?;
    Ok(Json(events::read_all()))
}

async fn pause(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize(&s, &headers)?;
    killswitch::pause().map_err(internal)?;
    Ok(Json(json!({ "ok": true })))
}

async fn resume(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize(&s, &headers)?;
    killswitch::resume().map_err(internal)?;
    Ok(Json(json!({ "ok": true })))
}

async fn list_approvals(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Vec<Value>>, ApiError> {
    authorize(&s, &headers)?;
    let mut out = Vec::new();
    for r in approval::pending() {
        let on_allowlist = match r.to.parse::<Address>() {
            Ok(a) => s.wallet.is_allowed(a).await.unwrap_or(false),
            Err(_) => false,
        };
        out.push(json!({
            "id": r.id,
            "ts": r.ts,
            "expiresAt": r.expires_at,
            "amount": r.amount,
            "to": r.to,
            "what": r.what,
            "reason": r.reason,
            "onAllowlist": on_allowlist,
        }));
    }
    Ok(Json(out))
}

async fn answer_approval(
    State(s): State<Arc<AppState>>,
    headers: HeaderMap,
    Path((id, action)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    authorize(&s, &headers)?;
    if !approval::valid_id(&id) {
        return Err((StatusCode::BAD_REQUEST, "invalid request id".into()));
    }
    let approve = match action.as_str() {
        "approve" => true,
        "decline" => false,
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                "action must be approve or decline".into(),
            ));
        }
    };
    approval::decide(&id, approve).map_err(|e| (StatusCode::CONFLICT, format!("{e:#}")))?;
    Ok(Json(json!({ "ok": true })))
}