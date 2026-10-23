import type { Metadata } from "next";
import Customizer from "@/components/customize/Customizer";

export const metadata: Metadata = {
  title: "Make a walk letter",
  description: "Upload your photos, write your letter, and share a link.",
};

export default function CustomizePage() {
  return <Customizer />;
}
