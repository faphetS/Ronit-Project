import { StackOutlet } from "../../motion/StackOutlet";
import { Scene } from "../../ui/Scene";
import { isPushedRoute } from "../sections";
import { TabBar } from "./TabBar";

/** Phone frame: screens stack and slide, and the glass tab bar floats above them. */
export function PhoneShell() {
  return (
    <div className="relative h-dvh overflow-hidden">
      <Scene preset="phone" />
      <StackOutlet isPushed={isPushedRoute} className="h-full" />
      <TabBar />
    </div>
  );
}
