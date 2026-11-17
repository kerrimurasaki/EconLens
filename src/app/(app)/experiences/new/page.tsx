import type { Metadata } from "next";
import { NewEventForm } from "./NewEventForm";

export const metadata: Metadata = { title: "New experience" };

export default function NewExperiencePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-navy-900">Start from a real-world event</h1>
        <p className="text-sm text-slate-600">
          Describe an incident, policy, business decision or everyday problem. You review every claim and concept before anything reaches students.
        </p>
      </header>
      <NewEventForm />
    </div>
  );
}
