import { requireNativeModule } from "expo";
import type { SafNative } from "./SafStorage.types";

export default requireNativeModule<SafNative>("SafStorage");
