import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState as RNAppState } from "react-native";
import {
  buildDemoPlan,
  buildDemoSessionExecution,
  DEMO_NOTICE,
  DEMO_PLAN_ID,
  findMatches,
  type ActivitySessionMatch,
  type AthleteProfile,
  type ChatMessage,
  type GarminActivity,
  type GarminStatus,
  type SessionExecution,
  type SessionLog,
  type SessionStatus,
  type TrainingPlan,
} from "@ridelab/shared";
import { api, ApiError } from "../api/client";
import { buildChatTrainingHistoryEntries } from "../lib/calendar";
import {
  activitySessionMatchRepository,
  calendarDemoSeedRepository,
  garminActivityRepository,
  planRepository,
  profileRepository,
  sessionExecutionRepository,
  sessionLogRepository,
  sessionStatusRepository,
} from "../storage/repository";

/** Ventana hacia atrás que cubre cada sincronización con Garmin. */
const SYNC_WINDOW_DAYS = 14;
/** Si la última sincronización tiene más de esto, un regreso a primer plano dispara una nueva. */
const STALE_SYNC_MINUTES = 15;
/** Ventana de historial combinado que viaja disponible para la tool del agente. */
const TRAINING_HISTORY_WINDOW_DAYS = 60;

export type GarminSyncStatus = "idle" | "syncing" | "synced" | "offline" | "error";

/**
 * Estado global de la app.
 *
 * Mantiene el plan activo, los registros y la conversación, y sincroniza todo
 * con AsyncStorage para que sobreviva al cierre de la aplicación.
 */

interface AppState {
  ready: boolean;
  plans: TrainingPlan[];
  activePlan: TrainingPlan | undefined;
  sessionStatus: Record<string, SessionStatus>;
  logs: SessionLog[];
  executions: SessionExecution[];
  activities: GarminActivity[];
  matches: ActivitySessionMatch[];
  garminSyncStatus: GarminSyncStatus;
  lastGarminSyncAt: string | undefined;
  profile: AthleteProfile | undefined;
  messages: ChatMessage[];
  garminStatus: GarminStatus;
  sending: boolean;
  chatError: string | undefined;
}

interface AppActions {
  sendMessage: (text: string) => Promise<void>;
  savePlan: (plan: TrainingPlan) => Promise<void>;
  setActivePlan: (planId: string) => Promise<void>;
  markSession: (sessionId: string, status: SessionStatus) => Promise<void>;
  saveLog: (log: SessionLog) => Promise<void>;
  /** Crea la ejecución real de una sesión planificada al tocar "Iniciar sesión". */
  startSession: (plannedSessionId: string) => Promise<SessionExecution>;
  /** Cierra la ejecución en curso; crea una sintética si nunca se inició. */
  finishSessionExecution: (
    plannedSessionId: string,
    patch: { actualRpe?: number; painLevel?: number; notes?: string },
  ) => Promise<SessionExecution>;
  /** Trae actividades del backend, las persiste (idempotente) y corre el matcher. */
  syncGarminActivities: () => Promise<void>;
  confirmMatch: (
    sessionExecutionId: string,
    garminActivityId: string,
    method?: "automatic" | "manual",
  ) => Promise<void>;
  rejectMatch: (sessionExecutionId: string, garminActivityId: string) => Promise<void>;
  unlinkMatch: (sessionExecutionId: string, garminActivityId: string) => Promise<void>;
  updateProfile: (patch: Partial<AthleteProfile>) => Promise<void>;
  refreshGarminStatus: () => Promise<void>;
  clearChatError: () => void;
}

const INITIAL_GARMIN_STATUS: GarminStatus = {
  status: "disconnected",
  dataSource: "mock",
  message: "Comprobando conexión…",
};

const AppContext = createContext<(AppState & AppActions) | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | undefined>();
  const [sessionStatus, setSessionStatus] = useState<Record<string, SessionStatus>>({});
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [executions, setExecutions] = useState<SessionExecution[]>([]);
  const [activities, setActivities] = useState<GarminActivity[]>([]);
  const [matches, setMatches] = useState<ActivitySessionMatch[]>([]);
  const [garminSyncStatus, setGarminSyncStatus] = useState<GarminSyncStatus>("idle");
  const [lastGarminSyncAt, setLastGarminSyncAt] = useState<string | undefined>();
  const [profile, setProfile] = useState<AthleteProfile | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [garminStatus, setGarminStatus] = useState<GarminStatus>(INITIAL_GARMIN_STATUS);
  const [garminStatusLoaded, setGarminStatusLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | undefined>();
  // Evita dos sincronizaciones concurrentes (montaje + regreso a primer plano casi simultáneos).
  const syncingRef = useRef(false);

  // Hidratación inicial desde disco.
  useEffect(() => {
    (async () => {
      const [
        storedPlans,
        storedActiveId,
        storedStatus,
        storedLogs,
        storedExecutions,
        storedActivities,
        storedMatches,
        storedProfile,
      ] = await Promise.all([
        planRepository.list(),
        planRepository.getActiveId(),
        sessionStatusRepository.all(),
        sessionLogRepository.list(),
        sessionExecutionRepository.list(),
        garminActivityRepository.list(),
        activitySessionMatchRepository.list(),
        profileRepository.get(),
      ]);

      setPlans(storedPlans);
      setActivePlanId(storedActiveId);
      setSessionStatus(storedStatus);
      setLogs(storedLogs);
      setExecutions(storedExecutions);
      setActivities(storedActivities);
      setMatches(storedMatches);
      setProfile(storedProfile);
      setReady(true);
    })();
  }, []);

  const refreshGarminStatus = useCallback(async () => {
    try {
      setGarminStatus(await api.getGarminStatus());
    } catch (error) {
      setGarminStatus({
        status: "disconnected",
        dataSource: "mock",
        message:
          error instanceof ApiError && error.kind === "offline"
            ? "Sin conexión con el coach"
            : "Garmin no conectado",
      });
    } finally {
      setGarminStatusLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refreshGarminStatus();
  }, [refreshGarminStatus]);

  const activePlan = useMemo(
    () => plans.find((plan) => plan.id === activePlanId),
    [plans, activePlanId],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      const userMessage: ChatMessage = {
        id: `local_${Date.now()}`,
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };

      const history = [...messages, userMessage];
      setMessages(history);
      setSending(true);
      setChatError(undefined);

      try {
        const historyCutoff = new Date(Date.now() - TRAINING_HISTORY_WINDOW_DAYS * 86_400_000)
          .toISOString()
          .slice(0, 10);

        const response = await api.sendChat({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          athleteProfile: profile,
          activePlanId,
          recentLogs: logs.slice(-5).map((log) => ({
            sessionTitle: log.sessionTitle,
            completedAt: log.completedAt,
            sessionRpe: log.sessionRpe,
            painLevel: log.pain?.level,
            exercises: log.exercises.map((exercise) => ({
              name: exercise.name,
              load: exercise.load,
              actualReps: exercise.actualReps,
            })),
          })),
          // Nunca se inyecta en el prompt: sólo lo resuelve el backend si el
          // agente invoca get_training_history/get_training_record.
          trainingHistory: buildChatTrainingHistoryEntries(plans, executions, activities, matches).filter(
            (entry) => entry.date >= historyCutoff,
          ),
        });

        setMessages((current) => [...current, response.message]);
        setGarminStatus(response.garminStatus);
      } catch (error) {
        setChatError(
          error instanceof ApiError
            ? error.message
            : "El coach no pudo responder. Inténtalo de nuevo.",
        );
        // El turno del usuario se conserva para que pueda reintentar sin reescribir.
      } finally {
        setSending(false);
      }
    },
    [messages, profile, activePlanId, logs, plans, executions, activities, matches, sending],
  );

  const savePlan = useCallback(async (plan: TrainingPlan) => {
    const saved = await planRepository.save(plan);
    await planRepository.setActiveId(saved.id);
    setPlans(await planRepository.list());
    setActivePlanId(saved.id);
  }, []);

  const setActivePlan = useCallback(async (planId: string) => {
    await planRepository.setActiveId(planId);
    setActivePlanId(planId);
  }, []);

  const markSession = useCallback(async (sessionId: string, status: SessionStatus) => {
    setSessionStatus(await sessionStatusRepository.set(sessionId, status));
  }, []);

  const saveLog = useCallback(async (log: SessionLog) => {
    await sessionLogRepository.save(log);
    setLogs(await sessionLogRepository.list());
    setSessionStatus(await sessionStatusRepository.set(log.sessionId, "completed"));
  }, []);

  const startSession = useCallback(async (plannedSessionId: string) => {
    const execution = await sessionExecutionRepository.start(plannedSessionId);
    setExecutions(await sessionExecutionRepository.list());
    return execution;
  }, []);

  const finishSessionExecution = useCallback(
    async (plannedSessionId: string, patch: { actualRpe?: number; painLevel?: number; notes?: string }) => {
      const execution = await sessionExecutionRepository.finish(plannedSessionId, patch);
      setExecutions(await sessionExecutionRepository.list());
      // Dispara una sincronización con Garmin en segundo plano: es una de las
      // señales explícitas para buscar la actividad correspondiente.
      void syncGarminActivities();
      return execution;
    },
    [],
  );

  /** Duración planificada de una sesión, buscando entre todos los planes guardados (no sólo el activo). */
  const plannedDurationFor = useCallback(
    (plannedSessionId: string): number => {
      for (const plan of plans) {
        for (const week of plan.weeks) {
          const session = week.sessions.find((item) => item.id === plannedSessionId);
          if (session) return session.estimatedMinutes;
        }
      }
      return 60;
    },
    [plans],
  );

  const syncGarminActivities = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setGarminSyncStatus("syncing");

    try {
      const endDate = new Date().toISOString().slice(0, 10);
      const startDate = new Date(Date.now() - SYNC_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
      const { activities: fetched } = await api.getGarminActivities(startDate, endDate);

      for (const activity of fetched) {
        await garminActivityRepository.save(activity);
      }

      const allActivities = await garminActivityRepository.list();
      const allExecutions = await sessionExecutionRepository.list();
      const allMatches = await activitySessionMatchRepository.list();
      const rejectedPairs = await activitySessionMatchRepository.rejectedPairKeys();

      const confirmedActivityIds = new Set(
        allMatches.filter((match) => match.status === "confirmed").map((match) => match.garminActivityId),
      );
      const confirmedExecutionIds = new Set(
        allMatches.filter((match) => match.status === "confirmed").map((match) => match.sessionExecutionId),
      );

      const candidateActivities = allActivities.filter((activity) => !confirmedActivityIds.has(activity.id));
      const candidateExecutions = allExecutions
        .filter((execution) => !confirmedExecutionIds.has(execution.id))
        .map((execution) => ({ ...execution, plannedDurationMinutes: plannedDurationFor(execution.plannedSessionId) }));

      const suggestions = findMatches(candidateExecutions, candidateActivities, rejectedPairs);

      for (const suggestion of suggestions) {
        if (!suggestion.best) continue;

        if (suggestion.status === "auto-confirm") {
          await activitySessionMatchRepository.confirm(suggestion.sessionExecutionId, suggestion.best.activityId, {
            method: "automatic",
            confidence: suggestion.best.confidence,
          });
        } else if (suggestion.status === "suggested") {
          const alreadySuggested = allMatches.some(
            (match) =>
              match.sessionExecutionId === suggestion.sessionExecutionId &&
              match.garminActivityId === suggestion.best!.activityId,
          );
          if (!alreadySuggested) {
            await activitySessionMatchRepository.save({
              id: `match_${suggestion.sessionExecutionId}_${suggestion.best.activityId}`,
              sessionExecutionId: suggestion.sessionExecutionId,
              garminActivityId: suggestion.best.activityId,
              status: "suggested",
              method: "automatic",
              confidence: suggestion.best.confidence,
              createdAt: new Date().toISOString(),
            });
          }
        }
      }

      setActivities(await garminActivityRepository.list());
      setMatches(await activitySessionMatchRepository.list());
      const now = new Date().toISOString();
      setLastGarminSyncAt(now);
      setGarminSyncStatus("synced");
    } catch (error) {
      setGarminSyncStatus(error instanceof ApiError && error.kind === "offline" ? "offline" : "error");
    } finally {
      syncingRef.current = false;
    }
  }, [plannedDurationFor]);

  const confirmMatch = useCallback(
    async (sessionExecutionId: string, garminActivityId: string, method: "automatic" | "manual" = "manual") => {
      const existing = matches.find(
        (match) => match.sessionExecutionId === sessionExecutionId && match.garminActivityId === garminActivityId,
      );
      await activitySessionMatchRepository.confirm(sessionExecutionId, garminActivityId, {
        method,
        confidence: existing?.confidence ?? 1,
      });
      setMatches(await activitySessionMatchRepository.list());
    },
    [matches],
  );

  const rejectMatch = useCallback(async (sessionExecutionId: string, garminActivityId: string) => {
    await activitySessionMatchRepository.reject(sessionExecutionId, garminActivityId);
    setMatches(await activitySessionMatchRepository.list());
  }, []);

  const unlinkMatch = useCallback(async (sessionExecutionId: string, garminActivityId: string) => {
    await activitySessionMatchRepository.unlink(sessionExecutionId, garminActivityId);
    setMatches(await activitySessionMatchRepository.list());
  }, []);

  // Siembra el escenario demo del 5 de agosto una sola vez, y sólo mientras Garmin
  // está en modo simulado — nunca mezcla datos falsos con una cuenta real.
  useEffect(() => {
    if (!ready || !garminStatusLoaded || garminStatus.dataSource !== "mock") return;

    (async () => {
      if (await calendarDemoSeedRepository.isSeeded()) return;

      if (!(await planRepository.get(DEMO_PLAN_ID))) {
        const demoPlan = buildDemoPlan();
        await planRepository.save(demoPlan);
        if (!(await planRepository.getActiveId())) {
          await planRepository.setActiveId(demoPlan.id);
        }
        setPlans(await planRepository.list());
        setActivePlanId((current) => current ?? demoPlan.id);
      }

      await sessionExecutionRepository.save(buildDemoSessionExecution());
      setExecutions(await sessionExecutionRepository.list());

      // Una sesión omitida, para completar el escenario demo pedido.
      setSessionStatus(await sessionStatusRepository.set("w2-d1", "skipped"));

      await calendarDemoSeedRepository.markSeeded();
      void syncGarminActivities();
    })();
  }, [ready, garminStatusLoaded, garminStatus.dataSource, syncGarminActivities]);

  // Vuelve a sincronizar al regresar a primer plano si la última sync tiene más de 15 min.
  useEffect(() => {
    const subscription = RNAppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const staleMs = STALE_SYNC_MINUTES * 60_000;
      const isStale = !lastGarminSyncAt || Date.now() - new Date(lastGarminSyncAt).getTime() > staleMs;
      if (isStale) void syncGarminActivities();
    });
    return () => subscription.remove();
  }, [lastGarminSyncAt, syncGarminActivities]);

  const updateProfile = useCallback(async (patch: Partial<AthleteProfile>) => {
    setProfile(await profileRepository.merge(patch));
  }, []);

  const value = useMemo(
    () => ({
      ready,
      plans,
      activePlan,
      sessionStatus,
      logs,
      executions,
      activities,
      matches,
      garminSyncStatus,
      lastGarminSyncAt,
      profile,
      messages,
      garminStatus,
      sending,
      chatError,
      sendMessage,
      savePlan,
      setActivePlan,
      markSession,
      saveLog,
      startSession,
      finishSessionExecution,
      syncGarminActivities,
      confirmMatch,
      rejectMatch,
      unlinkMatch,
      updateProfile,
      refreshGarminStatus,
      clearChatError: () => setChatError(undefined),
    }),
    [
      ready,
      plans,
      activePlan,
      sessionStatus,
      logs,
      executions,
      activities,
      matches,
      garminSyncStatus,
      lastGarminSyncAt,
      profile,
      messages,
      garminStatus,
      sending,
      chatError,
      sendMessage,
      savePlan,
      setActivePlan,
      markSession,
      saveLog,
      startSession,
      finishSessionExecution,
      syncGarminActivities,
      confirmMatch,
      rejectMatch,
      unlinkMatch,
      updateProfile,
      refreshGarminStatus,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp debe usarse dentro de AppProvider");
  return context;
}

export { DEMO_NOTICE };
