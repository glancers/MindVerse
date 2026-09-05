//! LLM 代理：服务端持 Key 调上游（OpenAI 兼容 / Anthropic 双协议），
//! SSE 逐 delta 透传给客户端。上游请求 5 分钟 chunk 重置超时（硬约束）。

use axum::body::Body;
use axum::extract::State;
use axum::http::header;
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::Row;
use std::time::Duration;
use tokio_stream::StreamExt;

use crate::error::{ApiResult, AppError};
use crate::AppState;

const TIMEOUT: Duration = Duration::from_secs(5 * 60);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatIn {
    pub provider_id: String,
    pub model: String,
    pub system: String,
    pub messages: Vec<ChatMessage>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: String,
    /// 字符串或多模态 parts（image_url 等），透传给上游
    pub content: Value,
    pub name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatTestIn {
    pub provider_id: String,
    pub model: String,
}

/// 从库里取该用户可见的 provider（id, type, base_url, api_key, name）
async fn load_provider(
    state: &AppState,
    user_id: &str,
    provider_id: &str,
) -> ApiResult<(String, String, String, String)> {
    let row = sqlx::query(
        "SELECT type, base_url, api_key, name FROM providers WHERE id = ? AND user_id = ?",
    )
    .bind(provider_id)
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok((
        row.try_get("type").unwrap_or_default(),
        row.try_get("base_url").unwrap_or_default(),
        row.try_get("api_key").unwrap_or_default(),
        row.try_get("name").unwrap_or_default(),
    ))
}

fn upstream_url(provider_type: &str, base_url: &str, path: &str) -> String {
    let base = base_url.trim_end_matches('/');
    // 前端存的方舟地址是相对路径（/ark/...，浏览器端走代理），服务端出网前补全域名
    let base = if base.starts_with('/') {
        format!("https://ark.cn-beijing.volces.com{base}")
    } else {
        base.to_string()
    };
    if provider_type == "anthropic" {
        format!("{base}/v1{path}")
    } else {
        format!("{base}{path}")
    }
}

/// SSE 事件序列化：`data: {...}\n\n`
fn sse_event(payload: Value) -> Vec<u8> {
    format!("data: {payload}\n\n").into_bytes()
}

fn build_headers(provider_type: &str, api_key: &str) -> reqwest::header::HeaderMap {
    let mut h = reqwest::header::HeaderMap::new();
    h.insert("content-type", "application/json".parse().unwrap());
    if provider_type == "anthropic" {
        h.insert("x-api-key", api_key.parse().unwrap());
        h.insert("anthropic-version", "2023-06-01".parse().unwrap());
    } else {
        h.insert("authorization", format!("Bearer {api_key}").parse().unwrap());
    }
    h
}

/// OpenAI 风格 content（字符串或 parts）→ Anthropic 消息 content：
/// 字符串原样；image_url 的 dataURL 解析为 base64 source，解析失败降级为占位文本
fn anthropic_content(content: &Value) -> Value {
    match content {
        Value::String(_) => content.clone(),
        Value::Array(parts) => Value::Array(
            parts
                .iter()
                .map(|p| {
                    if p["type"] == "image_url" {
                        let url = p["image_url"]["url"].as_str().unwrap_or("");
                        if let Some(rest) = url.strip_prefix("data:") {
                            if let Some(idx) = rest.find(";base64,") {
                                return json!({
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": &rest[..idx],
                                        "data": &rest[idx + 8..],
                                    }
                                });
                            }
                        }
                        json!({"type": "text", "text": "[不支持的图片格式]"})
                    } else {
                        json!({"type": "text", "text": p["text"].as_str().unwrap_or("")})
                    }
                })
                .collect(),
        ),
        _ => Value::String(String::new()),
    }
}

fn build_body(provider_type: &str, model: &str, system: &str, messages: &[ChatMessage], stream: bool) -> Value {
    if provider_type == "anthropic" {
        json!({
            "model": model,
            "stream": stream,
            "max_tokens": 4096,
            "system": system,
            "messages": messages.iter()
                .map(|m| json!({"role": m.role, "content": anthropic_content(&m.content)}))
                .collect::<Vec<_>>(),
        })
    } else {
        let mut msgs = vec![json!({"role": "system", "content": system})];
        for m in messages {
            let mut v = json!({"role": m.role, "content": m.content});
            if let Some(name) = &m.name {
                v["name"] = json!(name);
            }
            msgs.push(v);
        }
        json!({"model": model, "stream": stream, "messages": msgs})
    }
}

/// 从上游 SSE data 行 JSON 中提取增量文本（OpenAI choices[0].delta.content / Anthropic content_block_delta）
fn extract_delta(provider_type: &str, v: &Value) -> Option<String> {
    if provider_type == "anthropic" {
        if v["type"] == "content_block_delta" {
            v["delta"]["text"].as_str().map(String::from)
        } else {
            None
        }
    } else {
        v["choices"][0]["delta"]["content"].as_str().map(String::from)
    }
}

/// 从上游 SSE data 行 JSON 中提取推理增量（思考型模型的 reasoning_content）
fn extract_reasoning(provider_type: &str, v: &Value) -> Option<String> {
    if provider_type == "anthropic" {
        None
    } else {
        v["choices"][0]["delta"]["reasoning_content"].as_str().map(String::from)
    }
}

/// 解析上游字节流里的 SSE data 行（跳过 [DONE] 与注释行）
fn parse_data_lines(buf: &str) -> Vec<Value> {
    let mut out = vec![];
    for line in buf.split('\n') {
        let t = line.trim();
        if !t.starts_with("data:") {
            continue;
        }
        let payload = t[5..].trim();
        if payload.is_empty() || payload == "[DONE]" {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<Value>(payload) {
            out.push(v);
        }
    }
    out
}

/// POST /api/chat —— SSE 流式代理
pub async fn chat(
    user: crate::auth::AuthUser,
    State(state): State<AppState>,
    axum::Json(req): axum::Json<ChatIn>,
) -> ApiResult<Response> {
    let (ptype, base_url, api_key, _name) =
        load_provider(&state, &user.user_id, &req.provider_id).await?;
    if ptype.is_empty() || req.model.is_empty() {
        return Err(AppError::BadRequest("provider 或 model 缺失".into()));
    }

    let url = upstream_url(&ptype, &base_url, if ptype == "anthropic" { "/messages" } else { "/chat/completions" });
    let body = build_body(&ptype, &req.model, &req.system, &req.messages, true);

    let client = reqwest::Client::new();
    let upstream = client
        .post(&url)
        .headers(build_headers(&ptype, &api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::BadRequest(format!("上游连接失败: {}", e.status().map(|s| s.to_string()).unwrap_or_default())))?;

    if !upstream.status().is_success() {
        let status = upstream.status().as_u16();
        let text = upstream.text().await.unwrap_or_default();
        return Err(AppError::BadRequest(format!("上游返回 {status}: {}", &text[..text.len().min(200)])));
    }

    // 转发流：上游 chunk → 解析 SSE → 产出 {"delta"} / {"done"} 事件；单 chunk 读取 5 分钟超时
    let ptype_stream = ptype.clone();
    let mut upstream_stream = upstream.bytes_stream();
    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Vec<u8>, std::io::Error>>(32);

    tokio::spawn(async move {
        let mut buffer = String::new();
        let mut full_len: usize = 0;
        loop {
            let chunk = tokio::time::timeout(TIMEOUT, upstream_stream.next()).await;
            match chunk {
                Err(_) => {
                    let _ = tx
                        .send(Ok(sse_event(json!({"error": "上游超时（5 分钟无响应）"}))))
                        .await;
                    break;
                }
                Ok(None) => break,
                Ok(Some(Err(e))) => {
                    let _ = tx
                        .send(Ok(sse_event(json!({"error": format!("上游读取失败: {e}")}))))
                        .await;
                    break;
                }
                Ok(Some(Ok(bytes))) => {
                    buffer.push_str(&String::from_utf8_lossy(&bytes));
                    while let Some(idx) = buffer.find("\n\n") {
                        let raw: String = buffer.drain(..idx + 2).collect();
                        for v in parse_data_lines(&raw) {
                            if let Some(delta) = extract_delta(&ptype_stream, &v) {
                                full_len += delta.len();
                                let _ = tx.send(Ok(sse_event(json!({"delta": delta})))).await;
                            } else if let Some(r) = extract_reasoning(&ptype_stream, &v) {
                                let _ = tx.send(Ok(sse_event(json!({"reasoning": r})))).await;
                            }
                        }
                    }
                }
            }
        }
        let _ = tx.send(Ok(sse_event(json!({"done": true, "length": full_len})))).await;
    });

    let body = Body::from_stream(tokio_stream::wrappers::ReceiverStream::new(rx));
    Ok((
        [(
            header::CONTENT_TYPE,
            "text/event-stream",
        )],
        body,
    )
        .into_response())
}

/// POST /api/chat/test —— 非流式极短消息，返回延迟 ms
pub async fn chat_test(
    user: crate::auth::AuthUser,
    State(state): State<AppState>,
    axum::Json(req): axum::Json<ChatTestIn>,
) -> ApiResult<axum::Json<Value>> {
    let (ptype, base_url, api_key, _name) =
        load_provider(&state, &user.user_id, &req.provider_id).await?;

    let url = upstream_url(&ptype, &base_url, if ptype == "anthropic" { "/messages" } else { "/chat/completions" });
    let body = build_body(&ptype, &req.model, "You are a tester.", &[ChatMessage {
        role: "user".into(),
        content: "ping".into(),
        name: None,
    }], false);

    let start = std::time::Instant::now();
    let client = reqwest::Client::new();
    let res = tokio::time::timeout(Duration::from_secs(30), async {
        client
            .post(&url)
            .headers(build_headers(&ptype, &api_key))
            .json(&body)
            .send()
            .await
    })
    .await
    .map_err(|_| AppError::BadRequest("测试连接超时（30s）".into()))?
    .map_err(|e| AppError::BadRequest(format!("连接失败: {e}")))?;

    if !res.status().is_success() {
        let status = res.status().as_u16();
        let text = res.text().await.unwrap_or_default();
        return Err(AppError::BadRequest(format!(
            "HTTP {status}: {}",
            &text[..text.len().min(200)]
        )));
    }
    Ok(axum::Json(json!({"latencyMs": start.elapsed().as_millis() as u64})))
}

/// GET /api/providers/{id}/models —— 模型列表代理
pub async fn provider_models(
    user: crate::auth::AuthUser,
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> ApiResult<axum::Json<Vec<String>>> {
    let (ptype, base_url, api_key, _) = load_provider(&state, &user.user_id, &id).await?;
    let url = upstream_url(&ptype, &base_url, "/models");
    let client = reqwest::Client::new();
    let res = tokio::time::timeout(Duration::from_secs(30), async {
        client.get(&url).headers(build_headers(&ptype, &api_key)).send().await
    })
    .await
    .map_err(|_| AppError::BadRequest("获取模型列表超时".into()))?
    .map_err(|e| AppError::BadRequest(format!("连接失败: {e}")))?;

    if !res.status().is_success() {
        return Err(AppError::BadRequest(format!("HTTP {}", res.status().as_u16())));
    }
    let json: Value = res.json().await.map_err(|_| AppError::BadRequest("响应解析失败".into()))?;
    let list = json["data"].as_array().cloned().unwrap_or_default();
    let mut ids: Vec<String> = list
        .iter()
        .filter_map(|m| m["id"].as_str().map(String::from))
        .filter(|s| !s.is_empty())
        .collect();
    ids.sort();
    ids.dedup();
    Ok(axum::Json(ids))
}
