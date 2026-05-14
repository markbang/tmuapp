package dev.tmuapp.mobile

import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

private val JsonMediaType = "application/json; charset=utf-8".toMediaType()
private val HttpClient = OkHttpClient.Builder()
    .connectTimeout(5, TimeUnit.SECONDS)
    .readTimeout(5, TimeUnit.SECONDS)
    .writeTimeout(5, TimeUnit.SECONDS)
    .build()

suspend fun executeRequest(
    apiBase: String,
    apiToken: String?,
    method: String,
    path: String,
    body: String?,
): String = withContext(Dispatchers.IO) {
    val request = Request.Builder()
        .url(apiBase + path)
        .method(method, body?.toRequestBody(JsonMediaType))
        .apply {
            if (apiToken != null) {
                header("Authorization", "Bearer $apiToken")
            }
        }
        .build()

    HttpClient.newCall(request).execute().use { response ->
        "HTTP ${response.code}\n${response.body.string()}"
    }
}

fun urlEncode(value: String): String =
    URLEncoder.encode(value, StandardCharsets.UTF_8.name()).replace("+", "%20")

fun jsonEscape(value: String): String =
    value
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
