import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  getFollowUps,
  getInterviews,
  type Application,
} from "../api/applications";

type CalendarEventType = "FOLLOW_UP" | "INTERVIEW";

interface CalendarEvent {
  type: CalendarEventType;
  date: string;
  application: Application;
}

interface CalendarDay {
  key: string;
  date: string;
  events: CalendarEvent[];
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeStyle: "short",
  }).format(new Date(value));
}

function isSoon(value: string) {
  const eventDate = new Date(value).getTime();
  const now = Date.now();
  const threeDays = 3 * 24 * 60 * 60 * 1000;

  return eventDate >= now && eventDate - now <= threeDays;
}

function getDayKey(value: string) {
  const date = new Date(value);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function createCalendarEvents(
  followUps: Application[],
  interviews: Application[],
): CalendarEvent[] {
  const followUpEvents: CalendarEvent[] = followUps.flatMap((application) =>
    application.followUpAt
      ? [
          {
            type: "FOLLOW_UP" as const,
            date: application.followUpAt,
            application,
          },
        ]
      : [],
  );

  const interviewEvents: CalendarEvent[] = interviews.flatMap((application) =>
    application.interviewAt
      ? [
          {
            type: "INTERVIEW" as const,
            date: application.interviewAt,
            application,
          },
        ]
      : [],
  );

  return [...followUpEvents, ...interviewEvents].sort(
    (left, right) =>
      new Date(left.date).getTime() - new Date(right.date).getTime(),
  );
}

function groupEventsByDay(events: CalendarEvent[]): CalendarDay[] {
  const days = new Map<string, CalendarDay>();

  for (const event of events) {
    const key = getDayKey(event.date);
    const existingDay = days.get(key);

    if (existingDay) {
      existingDay.events.push(event);
      continue;
    }

    days.set(key, {
      key,
      date: event.date,
      events: [event],
    });
  }

  return Array.from(days.values());
}

function CalendarEventCard({ event }: { event: CalendarEvent }) {
  const { application } = event;

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-600">
            {event.type === "FOLLOW_UP" ? "Relance" : "Entretien"}
          </p>

          <h3 className="mt-1 text-lg font-semibold">
            {application.jobOffer.title}
          </h3>

          <p className="mt-1 text-gray-600">
            {application.jobOffer.company.name}
          </p>
        </div>

        <p
          className={
            isSoon(event.date)
              ? "text-sm font-semibold text-orange-600"
              : "text-sm font-medium text-gray-700"
          }
        >
          {formatTime(event.date)}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-sm text-gray-600">
        {application.jobOffer.location && (
          <span>{application.jobOffer.location}</span>
        )}

        {application.jobOffer.contractType && (
          <span>• {application.jobOffer.contractType}</span>
        )}

        <span>• {application.status}</span>
      </div>

      <p
        className={
          isSoon(event.date)
            ? "mt-3 text-sm font-semibold text-orange-600"
            : "mt-3 text-sm text-gray-700"
        }
      >
        {event.type === "FOLLOW_UP" ? "Relance prévue" : "Entretien prévu"} à{" "}
        {formatTime(event.date)}
      </p>

      <Link
        to={`/applications/${application.id}`}
        className="mt-3 inline-block text-sm font-medium text-blue-700 hover:underline"
      >
        Voir la candidature
      </Link>
    </article>
  );
}

function CalendarPage() {
  const followUpsQuery = useQuery({
    queryKey: ["follow-ups"],
    queryFn: getFollowUps,
  });

  const interviewsQuery = useQuery({
    queryKey: ["interviews"],
    queryFn: getInterviews,
  });

  if (followUpsQuery.isPending || interviewsQuery.isPending) {
    return (
      <main className="min-h-screen p-8">
        <p>Chargement du calendrier...</p>
      </main>
    );
  }

  if (followUpsQuery.isError || interviewsQuery.isError) {
    return (
      <main className="min-h-screen p-8">
        <p className="text-red-600">
          Impossible de charger les relances ou les entretiens.
        </p>
      </main>
    );
  }

  const events = createCalendarEvents(
    followUpsQuery.data,
    interviewsQuery.data,
  );
  const days = groupEventsByDay(events);

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold">Calendrier</h1>

        {days.length === 0 ? (
          <p className="mt-8 text-gray-600">Aucun événement à venir.</p>
        ) : (
          <div className="mt-8 space-y-10">
            {days.map((day) => (
              <section key={day.key}>
                <h2 className="text-xl font-semibold capitalize">
                  {formatDay(day.date)}
                </h2>

                <div className="mt-4 space-y-4">
                  {day.events.map((event) => (
                    <CalendarEventCard
                      key={`${event.type}-${event.application.id}-${event.date}`}
                      event={event}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default CalendarPage;
