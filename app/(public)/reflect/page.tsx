import type { Metadata } from "next";
import ReflectForm from "./reflect-form";

export const metadata: Metadata = {
  title: "Volunteer Reflection",
};

export const dynamic = "force-dynamic";

export default function ReflectPage() {
  const today = new Date().toISOString().split("T")[0];
  return <ReflectForm defaultDate={today} />;
}
