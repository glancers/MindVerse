//! /ark 透传代理：把请求原样转发到火山方舟（ark.cn-beijing.volces.com）。
//! 桌面端（Tauri）没有 vite 的 /ark 代理，浏览器直连方舟又受 CORS 限制，
//! guest 模式（Key 在前端）由这里中转；响应流式回传，SSE 语义不变。

use axum::body::Body;
use axum::extract::Request;
use axum::http::header;
use axum::response::{IntoResponse, Response};

const ARK_ORIGIN: &str = "https://ark.cn-beijing.volces.com";
/// 请求体上限：覆盖多模态（图片走 base64）场景
const BODY_LIMIT: usize = 50 * 1024 * 1024;

fn error_response(status: u16, msg: String) -> Response {
    let body = serde_json::json!({ "error": { "message": msg } }).to_string();
    (
        axum::http::StatusCode::from_u16(status).unwrap_or(axum::http::StatusCode::BAD_GATEWAY),
        [(header::CONTENT_TYPE, "application/json")],
        body,
    )
        .into_response()
}

pub async fn ark_proxy(req: Request) -> Response {
    let (parts, body) = req.into_parts();
    let pq = parts
        .uri
        .path_and_query()
        .map(|p| p.as_str().to_owned())
        .unwrap_or_default();
    // /ark/xxx → /xxx
    let tail = pq.strip_prefix("/ark").unwrap_or(&pq).to_owned();
    let url = format!("{ARK_ORIGIN}{tail}");

    let body = match axum::body::to_bytes(body, BODY_LIMIT).await {
        Ok(b) => b,
        Err(e) => return error_response(400, format!("请求体读取失败: {e}")),
    };

    let mut headers = parts.headers;
    headers.remove(header::HOST);
    headers.remove(header::ORIGIN);
    headers.remove(header::REFERER);

    let method = match reqwest::Method::from_bytes(parts.method.as_str().as_bytes()) {
        Ok(m) => m,
        Err(_) => return error_response(400, "不支持的请求方法".into()),
    };

    let client = reqwest::Client::new();
    let res = match client
        .request(method, &url)
        .headers(headers)
        .body(body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return error_response(502, format!("方舟连接失败: {e}")),
    };

    let mut builder = axum::http::Response::builder().status(res.status());
    for (k, v) in res.headers() {
        // 逐跳头删掉，交给 hyper 重新计算
        if k == header::TRANSFER_ENCODING
            || k == header::CONTENT_LENGTH
            || k == header::CONNECTION
        {
            continue;
        }
        builder = builder.header(k, v);
    }
    match builder.body(Body::from_stream(res.bytes_stream())) {
        Ok(r) => r,
        Err(e) => error_response(500, format!("响应构造失败: {e}")),
    }
}
