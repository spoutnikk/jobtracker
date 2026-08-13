import type { ApplicationStatus } from "../api/applications";

export const applicationStatuses: ApplicationStatus[] = [
  "DRAFT",
  "APPLIED",
  "FOLLOW_UP",
  "INTERVIEW",
  "ACCEPTED",
  "REJECTED",
];

export const applicationStatusLabels: Record<ApplicationStatus, string> = {
  DRAFT: "Brouillon",
  APPLIED: "Envoyée",
  FOLLOW_UP: "Relance",
  INTERVIEW: "Entretien",
  ACCEPTED: "Acceptée",
  REJECTED: "Refusée",
};

export function getApplicationStatusLabel(status: ApplicationStatus) {
  return applicationStatusLabels[status];
}
