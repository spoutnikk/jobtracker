import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAllApplications,
  getFollowUps,
  getInterviews,
  updateApplication,
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

function filterUpcomingEvents(
  events: CalendarEvent[],
  activeMonth: Date,
  now: Date = new Date(),
) {
  const nowTime = now.getTime();
  const sevenDaysFromNow = nowTime + 7 * 24 * 60 * 60 * 1000;
  const isCurrentMonth =
    activeMonth.getFullYear() === now.getFullYear() &&
    activeMonth.getMonth() === now.getMonth();

  return events.filter((event) => {
    const eventDate = new Date(event.date);
    const eventTime = eventDate.getTime();

    if (eventTime < nowTime) {
      return false;
    }

    const isInActiveMonth =
      eventDate.getFullYear() === activeMonth.getFullYear() &&
      eventDate.getMonth() === activeMonth.getMonth();

    if (!isCurrentMonth) {
      return isInActiveMonth;
    }

    return isInActiveMonth || eventTime <= sevenDaysFromNow;
  });
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

function MonthlyCalendar({
  events,
  onAddEvent,
  onMonthChange,
}: {
  events: CalendarEvent[];
  onAddEvent: (date: Date) => void;
  onMonthChange: (month: Date) => void;
}) {
  const [currentMonth, setCurrentMonth] = useState(() =>
    getInitialMonth(events),
  );
  const [showCalendar, setShowCalendar] = useState(true);

  useEffect(() => {
    onMonthChange(currentMonth);
  }, [currentMonth, onMonthChange]);

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
      new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() + offset,
        1,
        12,
      ),
    );
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCalendar((current) => !current)}
            aria-label={
              showCalendar ? "Masquer le calendrier" : "Afficher le calendrier"
            }
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            {showCalendar ? "Masquer" : "Afficher"}
          </button>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            aria-label="Mois suivant"
            className="rounded border border-gray-300 px-4 py-2 font-medium hover:bg-gray-50"
          >
            →
          </button>
        </div>
      </div>

      {showCalendar && (
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
                const followUps = dayEvents.filter(
                  (event) => event.type === "FOLLOW_UP",
                );
                const interviews = dayEvents.filter(
                  (event) => event.type === "INTERVIEW",
                );
                return (
                  <div
                    key={cell.key}
                    role="gridcell"
                    aria-label={`${formatCalendarCellDate(cell.date)}${isToday ? ", aujourd'hui" : ""}`}
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
                    <button
                      type="button"
                      onClick={() => onAddEvent(cell.date)}
                      aria-label={`Ajouter un événement le ${formatCalendarCellDate(cell.date)}`}
                      className="mt-1 text-xs font-medium text-blue-700 hover:underline"
                    >
                      +
                    </button>
                    {dayEvents.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {followUps.length > 0 && (
                          <span className="block rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800">
                            Relance
                            {followUps.length > 1 ? ` ${followUps.length}` : ""}
                          </span>
                        )}
                        {interviews.length > 0 && (
                          <span className="block rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                            Entretien
                            {interviews.length > 1
                              ? ` ${interviews.length}`
                              : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function CalendarPage() {
  const queryClient = useQueryClient();
  const [showUpcomingEvents, setShowUpcomingEvents] = useState(true);
  const [activeCalendarMonth, setActiveCalendarMonth] = useState<Date | null>(
    null,
  );
  const [selectedEventDate, setSelectedEventDate] = useState<string | null>(
    null,
  );
  const [selectedEventType, setSelectedEventType] = useState<
    "FOLLOW_UP" | "INTERVIEW"
  >("FOLLOW_UP");
  const [selectedEventTime, setSelectedEventTime] = useState("08:00");
  const [selectedApplicationId, setSelectedApplicationId] = useState("");
  const eventFormHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (selectedEventDate) {
      eventFormHeadingRef.current?.focus();
    }
  }, [selectedEventDate]);

  const followUpsQuery = useQuery({
    queryKey: ["follow-ups"],
    queryFn: getFollowUps,
  });

  const interviewsQuery = useQuery({
    queryKey: ["interviews"],
    queryFn: getInterviews,
  });

  const applicationsQuery = useQuery({
    queryKey: ["applications", "all"],
    queryFn: getAllApplications,
    enabled: selectedEventDate !== null,
  });
  const scheduleEventMutation = useMutation({
    mutationFn: ({
      applicationId,
      eventType,
      scheduledAt,
    }: {
      applicationId: number;
      eventType: "FOLLOW_UP" | "INTERVIEW";
      scheduledAt: string;
    }) =>
      updateApplication(
        applicationId,
        eventType === "FOLLOW_UP"
          ? { followUpAt: scheduledAt }
          : { interviewAt: scheduledAt },
      ),

    onSuccess: async () => {
      setSelectedEventDate(null);
      setSelectedApplicationId("");
      setSelectedEventType("FOLLOW_UP");
      setSelectedEventTime("08:00");

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["follow-ups"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["interviews"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["applications"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["dashboard-stats"],
        }),
      ]);
    },
  });
  function closeEventForm() {
    setSelectedEventDate(null);
    setSelectedApplicationId("");
    setSelectedEventType("FOLLOW_UP");
    setSelectedEventTime("08:00");
    scheduleEventMutation.reset();
  }

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
  const displayedMonth = activeCalendarMonth ?? getInitialMonth(events);
  const upcomingEvents = filterUpcomingEvents(events, displayedMonth);
  const days = groupEventsByDay(upcomingEvents);

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold">Calendrier</h1>

        <MonthlyCalendar
          events={events}
          onAddEvent={(date) => {
            setSelectedEventDate(getDayKey(date));
          }}
          onMonthChange={setActiveCalendarMonth}
        />
        {selectedEventDate && (
          <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2
              ref={eventFormHeadingRef}
              tabIndex={-1}
              className="text-xl font-semibold outline-none"
            >
              Ajouter un événement
            </h2>
            <div className="mt-4">
              <label
                htmlFor="calendar-event-type"
                className="block font-medium"
              >
                Type d'événement
              </label>

              <select
                id="calendar-event-type"
                value={selectedEventType}
                onChange={(event) => {
                  setSelectedEventType(
                    event.target.value as "FOLLOW_UP" | "INTERVIEW",
                  );
                }}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              >
                <option value="FOLLOW_UP">Relance</option>
                <option value="INTERVIEW">Entretien</option>
              </select>
            </div>
            <div className="mt-4">
              <label
                htmlFor="calendar-application"
                className="block font-medium"
              >
                Candidature
              </label>
              <select
                id="calendar-application"
                value={selectedApplicationId}
                onChange={(event) => {
                  setSelectedApplicationId(event.target.value);
                }}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              >
                <option value="">Sélectionner une candidature</option>

                {applicationsQuery.data?.map((application) => (
                  <option key={application.id} value={application.id}>
                    {application.jobOffer.title} —{" "}
                    {application.jobOffer.company.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              <label
                htmlFor="calendar-event-date"
                className="block font-medium"
              >
                Date de l'événement
              </label>
              <input
                id="calendar-event-date"
                type="date"
                value={selectedEventDate}
                readOnly
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
            <div className="mt-4">
              <label
                htmlFor="calendar-event-time"
                className="block font-medium"
              >
                Heure
              </label>

              <input
                id="calendar-event-time"
                type="time"
                value={selectedEventTime}
                onChange={(event) => {
                  setSelectedEventTime(event.target.value);
                }}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
            <button
              type="button"
              disabled={
                selectedApplicationId === "" ||
                selectedEventTime === "" ||
                scheduleEventMutation.isPending
              }
              onClick={() => {
                if (
                  !selectedEventDate ||
                  selectedApplicationId === "" ||
                  selectedEventTime === ""
                ) {
                  return;
                }

                scheduleEventMutation.mutate({
                  applicationId: Number(selectedApplicationId),
                  eventType: selectedEventType,
                  scheduledAt: new Date(
                    `${selectedEventDate}T${selectedEventTime}:00`,
                  ).toISOString(),
                });
              }}
              className="mt-4 rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {scheduleEventMutation.isPending
                ? "Enregistrement..."
                : selectedEventType === "FOLLOW_UP"
                  ? "Enregistrer la relance"
                  : "Enregistrer l'entretien"}
            </button>
            <button
              type="button"
              onClick={closeEventForm}
              disabled={scheduleEventMutation.isPending}
              className="ml-3 mt-4 rounded border border-gray-300 px-4 py-2 font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Annuler
            </button>
            {scheduleEventMutation.isError && (
              <p className="mt-3 text-red-600">
                Impossible de programmer l'événement.
              </p>
            )}
          </section>
        )}

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
