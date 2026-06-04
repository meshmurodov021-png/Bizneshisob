package uz.bizneshisob.app.widget

import android.content.Context
import androidx.glance.appwidget.updateAll
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

object ProfitWidgetUpdater {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    fun refreshAll(context: Context) {
        val appContext = context.applicationContext
        scope.launch {
            ProfitWidget().updateAll(appContext)
        }
    }
}
