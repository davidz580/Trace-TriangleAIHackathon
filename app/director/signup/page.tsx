import type { Metadata } from "next";
import SignUpForm from "./signup-form";

export const metadata: Metadata = {
  title: "Create Account",
};

export default function DirectorSignUpPage() {
  return <SignUpForm />;
}
