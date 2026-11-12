/**
 * Responses in the HTTP API's payload 2.0 shape. No CORS headers: API Gateway
 * answers preflight and sets them itself (modules/aws/apigateway).
 */
export function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}
