package expo.modules.timelapsecreator

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class TimelapseOptions : Record {
  @Field val videoUri: String = ""
  @Field val outputPath: String = ""
  @Field val outputSeconds: Double = 30.0
  @Field val width: Int = 720
  @Field val height: Int = 1280
  @Field val frameRate: Int = 30
  @Field val bitRate: Int = 3_500_000
  @Field val overlayStyle: String = "none"
  @Field val overlayText: String = ""
  @Field val streak: Int = 0
  @Field val timerMode: String = "countdown"
  @Field val recordingSeconds: Double = 0.0
  @Field val goalSeconds: Double = 0.0
}

class TimelapseCreatorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TimelapseCreator")

    Events("onProgress", "onError")

    AsyncFunction("createTimelapse") { options: TimelapseOptions ->
      sendEvent("onError", mapOf(
        "code" to "NOT_IMPLEMENTED",
        "message" to "Android not yet supported"
      ))
      throw Exception("Android timelapse creation not yet implemented")
    }
  }
}
