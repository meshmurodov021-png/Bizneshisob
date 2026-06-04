package uz.bizneshisob.app.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.ImageProvider
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import uz.bizneshisob.app.MainActivity
import uz.bizneshisob.app.R

class ProfitWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent {
            ProfitWidgetContent(WidgetDataStore.load(context))
        }
    }
}

@Composable
private fun ProfitWidgetContent(snapshot: WidgetSnapshot) {
    val bgRes = when (snapshot.state) {
        WidgetVisualState.RECORD -> R.drawable.widget_bg_record
        WidgetVisualState.HIGH -> R.drawable.widget_bg_high
        WidgetVisualState.POSITIVE -> R.drawable.widget_bg_positive
        WidgetVisualState.ZERO -> R.drawable.widget_bg_zero
        WidgetVisualState.NEGATIVE -> R.drawable.widget_bg_negative
        WidgetVisualState.NEUTRAL -> R.drawable.widget_bg_neutral
    }

    val amountColor = when (snapshot.state) {
        WidgetVisualState.RECORD, WidgetVisualState.HIGH -> ColorProvider(R.color.bh_warning)
        WidgetVisualState.POSITIVE -> ColorProvider(R.color.bh_success)
        WidgetVisualState.ZERO -> ColorProvider(R.color.bh_accent_blue)
        WidgetVisualState.NEGATIVE -> ColorProvider(R.color.bh_danger)
        WidgetVisualState.NEUTRAL -> ColorProvider(R.color.bh_text_primary)
    }

    val statusLine = buildStatusLine(snapshot)
    val sparkles = if (snapshot.state == WidgetVisualState.RECORD) "✨ 🚀 ✨" else ""

    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .cornerRadius(32.dp)
            .background(ImageProvider(bgRes))
            .clickable(actionStartActivity<MainActivity>())
            .padding(14.dp)
    ) {
        Column(
            modifier = GlanceModifier.fillMaxSize(),
            verticalAlignment = Alignment.Vertical.Top,
            horizontalAlignment = Alignment.Horizontal.Start
        ) {
            Row(
                modifier = GlanceModifier.fillMaxWidth(),
                verticalAlignment = Alignment.Vertical.CenterVertically
            ) {
                Text(text = "💰", style = TextStyle(fontSize = 14.sp))
                Spacer(modifier = GlanceModifier.width(6.dp))
                Text(
                    text = "BiznesHisob",
                    style = TextStyle(
                        color = ColorProvider(R.color.bh_brand_purple),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                )
            }

            Spacer(modifier = GlanceModifier.height(8.dp))

            Text(
                text = "BUGUNGI SOF FOYDA",
                style = TextStyle(
                    color = ColorProvider(R.color.bh_text_muted),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Medium
                )
            )

            Spacer(modifier = GlanceModifier.height(4.dp))

            Text(
                text = snapshot.formattedAmount,
                style = TextStyle(
                    color = amountColor,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold
                ),
                maxLines = 2
            )

            Spacer(modifier = GlanceModifier.defaultWeight())

            Text(
                text = statusLine,
                style = TextStyle(
                    color = ColorProvider(R.color.bh_text_muted),
                    fontSize = 11.sp
                ),
                maxLines = 2
            )

            if (sparkles.isNotEmpty()) {
                Spacer(modifier = GlanceModifier.height(2.dp))
                Text(text = sparkles, style = TextStyle(fontSize = 10.sp))
            }
        }
    }
}

private fun buildStatusLine(snapshot: WidgetSnapshot): String {
    return when (snapshot.state) {
        WidgetVisualState.RECORD -> "🏆 ${snapshot.statusText}"
        WidgetVisualState.HIGH -> "🏆 ${snapshot.statusText}"
        else -> "${snapshot.statusEmoji} ${snapshot.statusText}"
    }
}

class ProfitWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = ProfitWidget()

    override fun onUpdate(
        context: Context,
        appWidgetManager: android.appwidget.AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        WidgetRefreshScheduler.enqueueLightRefresh(context)
    }
}
