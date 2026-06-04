package uz.bizneshisob.app.widget

/**
 * Mirrors web app widget state logic (index.html pushWidgetSnapshot).
 */
object WidgetStateResolver {
    private const val HIGH_PROFIT_UZS = 1_000_000L

    data class Resolved(
        val state: WidgetVisualState,
        val statusEmoji: String,
        val statusText: String
    )

    fun resolve(todayNetUzs: Long, dailyTargetUzs: Long): Resolved {
        return when {
            dailyTargetUzs > 0 && todayNetUzs >= dailyTargetUzs -> Resolved(
                WidgetVisualState.RECORD,
                "🏆",
                "Rekord kun!"
            )
            todayNetUzs < 0 -> Resolved(
                WidgetVisualState.NEGATIVE,
                "📊",
                "Ertaga yaxshiroq bo'ladi"
            )
            todayNetUzs == 0L -> Resolved(
                WidgetVisualState.ZERO,
                "💪",
                "Davom eting"
            )
            todayNetUzs >= HIGH_PROFIT_UZS -> Resolved(
                WidgetVisualState.HIGH,
                "🚀",
                "Ajoyib natija"
            )
            todayNetUzs >= 100_000 -> Resolved(
                WidgetVisualState.POSITIVE,
                "📈",
                "O'sishda davom etmoqda"
            )
            else -> Resolved(
                WidgetVisualState.POSITIVE,
                "🎉",
                "Yaxshi boshlanish"
            )
        }
    }

    fun recordExtras(): Resolved = Resolved(
        WidgetVisualState.RECORD,
        "🚀",
        "Biznes uchmoqda!"
    )
}
