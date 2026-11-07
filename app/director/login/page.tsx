import type { Metadata } from "next";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Director Login",
};

export default function DirectorLoginPage() {
  return <LoginForm />;
}
