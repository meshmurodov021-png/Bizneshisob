package uz.bizneshisob.app.widget

import org.json.JSONObject

enum class WidgetVisualState {
    POSITIVE,
    HIGH,
    RECORD,
    ZERO,
    NEGATIVE,
    NEUTRAL
}

data class WidgetSnapshot(
    val todayNetUzs: Long,
    val formattedAmount: String,
    val currencyCode: String,
    val dailyTargetUzs: Long,
    val statusEmoji: String,
    val statusText: String,
    val state: WidgetVisualState,
    val updatedAt: Long
) {
    companion object {
        fun empty(): WidgetSnapshot = WidgetSnapshot(
            todayNetUzs = 0L,
            formattedAmount = "0 soʻm",
            currencyCode = "UZS",
            dailyTargetUzs = 0L,
            statusEmoji = "💪",
            statusText = "Davom eting",
            state = WidgetVisualState.NEUTRAL,
            updatedAt = 0L
        )

        fun fromJson(raw: String?): WidgetSnapshot {
            if (raw.isNullOrBlank()) return empty()
            return try {
                val o = JSONObject(raw)
                WidgetSnapshot(
                    todayNetUzs = o.optLong("todayNetUzs", 0L),
                    formattedAmount = o.optString("formattedAmount", "0 soʻm"),
                    currencyCode = o.optString("currencyCode", "UZS"),
                    dailyTargetUzs = o.optLong("dailyTargetUzs", 0L),
                    statusEmoji = o.optString("statusEmoji", "💪"),
                    statusText = o.optString("statusText", "Davom eting"),
                    state = parseState(o.optString("state", "neutral")),
                    updatedAt = o.optLong("updatedAt", System.currentTimeMillis())
                )
            } catch (_: Exception) {
                empty()
            }
        }

        private fun parseState(value: String): WidgetVisualState = when (value.lowercase()) {
            "positive" -> WidgetVisualState.POSITIVE
            "high" -> WidgetVisualState.HIGH
            "record" -> WidgetVisualState.RECORD
            "zero" -> WidgetVisualState.ZERO
            "negative" -> WidgetVisualState.NEGATIVE
            else -> WidgetVisualState.NEUTRAL
        }
    }
}
