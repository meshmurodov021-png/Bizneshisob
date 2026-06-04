package uz.bizneshisob.app

import android.app.Application
import uz.bizneshisob.app.widget.WidgetRefreshScheduler

class BiznesHisobApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        WidgetRefreshScheduler.schedulePeriodic(this)
    }
}
