import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { ModelPicker } from "@/naming/ModelPicker";

export default definePluginApp((app) => {


  app.slots.settingsSection({
    id: "agent",
    title: "Naming agent",
    description:
      "Which agent writes thread names. Keep the default to use each thread's own agent on its smallest model, or search the catalogue for one model to always use.",
    component: ModelPicker,
  });
});
