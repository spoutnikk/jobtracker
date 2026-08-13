import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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

interface MonthCell {
  key: string;
  date: Date;
  isCurrentMonth: boolean;
}

const weekDays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

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

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatCalendarCellDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function isSoon(value: string) {
  const eventDate = new Date(value).getTime();
  const now = Date.now();
  const threeDays = 3 * 24 * 60 * 60 * 1000;

  return eventDate >= now && eventDate - now <= threeDays;
}

function getDayKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;

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

function createMonthCells(month: Date): MonthCell[] {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();

  const firstDay = new Date(year, monthIndex, 1, 12);
  const mondayBasedWeekDay = (firstDay.getDay() + 6) % 7;

  const gridStart = new Date(year, monthIndex, 1 - mondayBasedWeekDay, 12);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + index,
      12,
    );

    return {
      key: getDayKey(date),
      date,
      isCurrentMonth: date.getMonth() === monthIndex,
    };
  });
}

function getInitialMonth(events: CalendarEvent[]) {
  const firstEvent = events[0];

  if (firstEvent) {
    const date = new Date(firstEvent.date);

    return new Date(date.getFullYear(), date.getMonth(), 1, 12);
  }

  const now = new Date();

  return new Date(now.getFullYear(), now.getMonth(), 1, 12);
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

function MonthlyCalendar({ events }: { events: CalendarEvent[] }) {
  const [currentMonth, setCurrentMonth] = useState(() =>
    getInitialMonth(events),
  );
  const [expandedDays, setExpandedDays] = useState<Set<string>>(
    () => new Set(),
  );

  const today = new Date();
  const todayKey = getDayKey(today);

  const monthCells = createMonthCells(currentMonth);

  const eventsByDay = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const key = getDayKey(event.date);
    const existingEvents = eventsByDay.get(key);

    if (existingEvents) {
      existingEvents.push(event);
    } else {
      eventsByDay.set(key, [event]);
    }
  }

  function goToToday() {
    const now = new Date();

    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1, 12));
  }

  function changeMonth(offset: number) {
    setCurrentMonth(
      (month) =>
        new Date(month.getFullYear(), month.getMonth() + offset, 1, 12),
    );
  }
  function toggleDayExpansion(dayKey: string) {
    setExpandedDays((current) => {
      const next = new Set(current);

      if (next.has(dayKey)) {
        next.delete(dayKey);
      } else {
        next.add(dayKey);
      }

      return next;
    });
  }
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            aria-label="Mois précédent"
            className="rounded border border-gray-300 px-4 py-2 font-medium hover:bg-gray-50"
          >
            ←
          </button>

          <button
            type="button"
            onClick={goToToday}
            className="rounded border border-gray-300 px-4 py-2 font-medium hover:bg-gray-50"
          >
            Aujourd'hui
          </button>
        </div>

        <h2 className="text-2xl font-semibold capitalize">
          {formatMonth(currentMonth)}
        </h2>

        <button
          type="button"
          onClick={() => changeMonth(1)}
          aria-label="Mois suivant"
          className="rounded border border-gray-300 px-4 py-2 font-medium hover:bg-gray-50"
        >
          →
        </button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[700px]">
          <div
            className="grid grid-cols-7 border-l border-t border-gray-200"
            aria-hidden="true"
          >
            {weekDays.map((day) => (
              <div
                key={day}
                className="border-b border-r border-gray-200 bg-gray-50 p-2 text-center text-sm font-semibold text-gray-600"
              >
                {day}
              </div>
            ))}
          </div>

          <div
            role="grid"
            aria-label={`Calendrier ${formatMonth(currentMonth)}`}
            className="grid grid-cols-7 border-l border-gray-200"
          >
            {monthCells.map((cell) => {
              const dayEvents = eventsByDay.get(cell.key) ?? [];
              const isToday = cell.key === todayKey;
              const isExpanded = expandedDays.has(cell.key);
              const visibleEvents = isExpanded
                ? dayEvents
                : dayEvents.slice(0, 3);
              const hiddenEventCount = dayEvents.length - visibleEvents.length;

              return (
                <div
                  key={cell.key}
                  role="gridcell"
                  aria-label={`${formatCalendarCellDate(cell.date)}${
                    isToday ? ", aujourd'hui" : ""
                  }`}
                  className={[
                    "min-h-32 border-b border-r border-gray-200 p-2",
                    cell.isCurrentMonth ? "bg-white" : "bg-gray-50",
                    isToday ? "ring-2 ring-inset ring-blue-500" : "",
                  ].join(" ")}
                >
                  <p
                    className={
                      cell.isCurrentMonth
                        ? "text-sm font-semibold text-gray-900"
                        : "text-sm text-gray-400"
                    }
                  >
                    {cell.date.getDate()}
                  </p>

                  {dayEvents.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {visibleEvents.map((event) => (
                        <Link
                          key={`${event.type}-${event.application.id}-${event.date}`}
                          to={`/applications/${event.application.id}`}
                          className={[
                            "block rounded px-2 py-1 text-xs font-medium",
                            event.type === "FOLLOW_UP"
                              ? "bg-blue-50 text-blue-800 hover:bg-blue-100"
                              : "bg-amber-50 text-amber-800 hover:bg-amber-100",
                          ].join(" ")}
                        >
                          {formatTime(event.date)} ·{" "}
                          {event.type === "FOLLOW_UP" ? "Relance" : "Entretien"}{" "}
                          · {event.application.jobOffer.title}
                        </Link>
                      ))}

                      {dayEvents.length > 3 && (
                        <button
                          type="button"
                          onClick={() => toggleDayExpansion(cell.key)}
                          className="mt-1 text-xs font-medium text-blue-700 hover:underline"
                        >
                          {isExpanded
                            ? "Réduire"
                            : `+ ${hiddenEventCount} autres`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function CalendarPage() {
  const [showUpcomingEvents, setShowUpcomingEvents] = useState(true);
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

        <MonthlyCalendar events={events} />

        <section className="mt-12">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold">Événements à venir</h2>

            <button
              type="button"
              onClick={() => setShowUpcomingEvents((current) => !current)}
              aria-label={
                showUpcomingEvents
                  ? "Masquer les événements à venir"
                  : "Afficher les événements à venir"
              }
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              {showUpcomingEvents ? "Masquer" : "Afficher"}
            </button>
          </div>

          {showUpcomingEvents &&
            (days.length === 0 ? (
              <p className="mt-4 text-gray-600">Aucun événement à venir.</p>
            ) : (
              <div className="mt-6 space-y-10">
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
            ))}
        </section>
      </div>
    </main>
  );
}

export default CalendarPage;
