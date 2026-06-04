package uz.bizneshisob.app.widget

import android.content.Context

object WidgetDataStore {
    private const val PREFS = "biznes_hisob_widget"
    private const val KEY_SNAPSHOT = "snapshot_json"

    fun save(context: Context, json: String) {
        context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_SNAPSHOT, json)
            .putLong("updated_at", System.currentTimeMillis())
            .apply()
    }

    fun load(context: Context): WidgetSnapshot {
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return WidgetSnapshot.fromJson(prefs.getString(KEY_SNAPSHOT, null))
    }
}
