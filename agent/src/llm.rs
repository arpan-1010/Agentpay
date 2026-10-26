use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub struct LlmProvider {
    pub name: &'static str,
    pub base_url: &'static str,
    pub key_env: &'static str,
    pub model: &'static str,
}

pub const PROVIDERS: [LlmProvider; 3] = [
    LlmProvider {
        name: "nemotron",
        base_url: "https://integrate.api.nvidia.com/v1",
        key_env: "NVIDIA_API_KEY",
        model: "nvidia/nemotron-3-ultra-550b-a55b",
    },
    LlmProvider {
        name: "gemini",
        base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
        key_env: "GEMINI_API_KEY",
        model: "gemini-3.8-flash",
    },
    LlmProvider {
        name: "codestral",
        base_url: "https://api.mistral.ai/v1",
        key_env: "MISTRAL_API_KEY",
        model: "codestral-latest",
    },
];

fn default_kind() -> String {
    "function".to_string()
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ToolCall {
    #[serde(default)]
    pub id: String,
    #[serde(rename = "type", default = "default_kind")]
    pub kind: String,
    pub function: FunctionCall,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extra_content: Option<Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Message {
    pub role: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

impl Message {
    pub fn system(text: &str) -> Self {
        Self { role: "system".into(), content: Some(text.into()), tool_calls: None, tool_call_id: None }
    }
    pub fn user(text: &str) -> Self {
        Self { role: "user".into(), content: Some(text.into()), tool_calls: None, tool_call_id: None }
    }
    pub fn tool_result(id: String, content: String) -> Self {
        Self { role: "tool".into(), content: Some(content), tool_calls: None, tool_call_id: Some(id) }
    }
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: Message,
}

fn prepare_messages(p: &LlmProvider, messages: &[Message]) -> Vec<Message> {
    let is_gemini = p.name == "gemini";

    messages
        .iter()
        .cloned()
        .map(|mut m| {
            if let Some(calls) = m.tool_calls.as_mut() {
                for call in calls.iter_mut() {
                    if is_gemini {
                        if call.extra_content.is_none() {
                            call.extra_content = Some(json!({
                                "google": { "thought_signature": "skip_thought_signature_validator" }
                            }));
                        }
                    } else {
                        call.extra_content = None;
                    }
                }
            }
            m
        })
        .collect()
}

pub async fn chat(
    http: &reqwest::Client,
    p: &LlmProvider,
    messages: &[Message],
    tools: &Value,
) -> Result<Message> {
    let key = std::env::var(p.key_env).with_context(|| format!("{} is not set", p.key_env))?;
    let prepared = prepare_messages(p, messages);

    let body = json!({
        "model": p.model,
        "messages": prepared,
        "tools": tools,
        "tool_choice": "auto",
    });

    let resp = http
        .post(format!("{}/chat/completions", p.base_url))
        .bearer_auth(key)
        .json(&body)
        .send()
        .await
        .context("request failed")?;

    let status = resp.status();
    let text = resp.text().await?;
    if !status.is_success() {
        let short: String = text.chars().take(200).collect();
        bail!("HTTP {status}: {short}");
    }

    let parsed: ChatResponse = serde_json::from_str(&text).context("unexpected response shape")?;
    parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message)
        .context("response had no choices")
}