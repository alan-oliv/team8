import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './theme.css';
import { buildCast } from '../shared/cast';
import type { Agent } from '../shared/domain';
import { wallOrder as rosterOrder } from '../shared/roster';
import { postJson } from './api';
import { NeedsYou } from './chrome/NeedsYou';
import { Panel } from './chrome/Panel';
import { QuestionModal } from './chrome/QuestionModal';
import { firstQuestion } from './chrome/question-answers';
import { Splash, prefersReducedMotion } from './chrome/Splash';
import { StatusBar } from './chrome/StatusBar';
import { StopConfirm, WatchConfirm } from './chrome/StopConfirm';
import { byRow, readStoredFolder, scopeOf } from './chrome/TeamSelect';
import { PendingQuestionsContext } from './components/Composer';
import { DiffModal } from './components/DiffModal';
import { StopContext } from './components/StopButton';
import { CastContext } from './state/useCast';
import { useKeyboard } from './state/useKeyboard';
import { SettingsContext, useSettings } from './state/useSettings';
import { useSpendSamples } from './state/useSpendSamples';
import { DiffContext, useTeamState } from './state/useTeamState';
import { WatchContext } from './state/useWatch';
import { Comms } from './views/Comms';
import { FirstLight, leadNameOf } from './views/FirstLight';
import { Grid } from './views/Grid';
import { LeftSession } from './views/LeftSession';
import { NoSessions } from './views/NoSessions';
import { Overview } from './views/Overview';
import { Plan } from './views/Plan';
import { Rail } from './views/Rail';
import { Tasks } from './views/Tasks';
import { Trace } from './views/Trace';
import { Usage } from './views/Usage';
import { Wall } from './views/Wall';
import { Workflow } from './views/Workflow';

// "Chat about this" hands the operator to the composer of whoever asked, or to
// the one composer there is; workflow mode has none, and nothing takes focus.
function focusComposer(agent: string): void {
  const boxes = [...document.querySelectorAll<HTMLTextAreaElement>('textarea[data-composer-for]')];
  (boxes.find((box) => box.dataset.composerFor === agent) ?? boxes[0])?.focus();
}

export function App() {
  const store = useTeamState();
  const appearance = useSettings(store.state?.folder);
  const [now, setNow] = useState(() => Date.now());
  const [teamsOpen, setTeamsOpen] = useState(false);
  // The entry splash plays once per app load over whichever shell renders
  // underneath, and is unmounted the moment it reports done.
  const [splashDone, setSplashDone] = useState(false);

  // The theme lives on the console root, but the page behind it is the body's,
  // and an overscroll on a light theme would otherwise flash the dark default.
  useEffect(() => {
    document.documentElement.style.backgroundColor = appearance.vars['--term'];
  }, [appearance.vars]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const state = store.state;

  // Solo (decisions 23/24): a roster of one whose session carries a subagent
  // tree. The switcher then offers stream · trace · tasks · usage, and a
  // `trace` in the URL of any OTHER session falls back to the wall rather
  // than mounting a view its switcher never offered.
  const soloLead = state !== null && state.agents.length === 1 ? state.agents[0] : null;
  // A `/s/:sessionId` URL (task #4) is never gated behind that agents.length
  // check — the whole point of the route is "no team required", so its lead is
  // whichever agent the session's own roster names lead rather than a count.
  const routedLead =
    state !== null && store.sessionRoute !== null
      ? (state.agents.find((a) => a.isLead) ?? state.agents[0] ?? null)
      : null;
  const traceLead = soloLead ?? routedLead;
  // The ROSTER decides the mode, never the route. `/s/:sessionId` used to force
  // solo on its own, so a session reached that way and then given teammates
  // kept a one-pill switcher and a `solo` kind pill over a wall of four
  // columns — while the picker that navigated there called the same session
  // `teammates` off `members >= 2`. The route's real job is above: resolving a
  // lead without a roster-of-one check. Before the first snapshot there is no
  // roster to ask, so the route stands in as the only hint there is.
  const solo = state === null ? store.sessionRoute !== null : state.agents.length <= 1;
  // `trace` is offered when its subject exists (decision 24's rule), and on a
  // bare session it does not: no subagents, nothing to draw lifelines for. A
  // team never offers it either, whatever it has spawned — its switcher is the
  // seven views. Either way a `trace` left in the URL falls back to the stream
  // rather than mounting a view with no tab above it.
  const hasSubagents = Object.values(state?.subagents ?? {}).some((list) => list.length > 0);
  const offersTrace = solo && hasSubagents;
  const view =
    (store.view === 'trace' && !offersTrace) || (store.view === 'plan' && !state?.plan) ? 'wall' : store.view;
  // Lives here, not in the view, so switching away from usage and back does
  // not restart the sampler — the same reason widths and hidden sessions live
  // above the views that read them.
  const spendSamples = useSpendSamples(state?.totalCostUsd, state?.agents);
  const toggleTeams = useCallback(() => setTeamsOpen((open) => !open), []);

  // An open-this-thread intent, not a selection: comms opens the everyone room
  // on any plain view switch, and only the in-flight badge asks it for one
  // agent's messages. Dropped on the way out, so the next visit is plain again.
  const [mailFor, setMailFor] = useState<string | null>(null);
  // The trace view's selected lane. Lives here like mailFor so leaving and
  // returning to trace keeps the operator's place.
  const [traceSelected, setTraceSelected] = useState<string | null>(null);
  useEffect(() => {
    if (view !== 'comms') setMailFor(null);
  }, [view]);

  // A comms "show in wall" scroll hint — the pair's other half, dropped once
  // the wall is left so a later plain focus change does not re-trigger it.
  const [alsoReveal, setAlsoReveal] = useState<string | null>(null);
  useEffect(() => {
    if (view !== 'wall') setAlsoReveal(null);
  }, [view]);

  // "Stop watching" is a view-local dismissal, never written to `~/.claude` and
  // scoped to this tab — the team keeps running and this state is the only
  // place that knows the console stopped following it.
  const [dismissed, setDismissed] = useState(false);
  const [pendingDismiss, setPendingDismiss] = useState(false);
  const [awaySince, setAwaySince] = useState<{ at: number; cost: number } | null>(null);

  // The console actually switching teams is what "watching" means — dismissal
  // never survives past that, whichever way the switch happened.
  useEffect(() => {
    setDismissed(false);
  }, [state?.teamName]);

  // What the picker would let you switch to, straight off the frame.
  const elsewhere = useMemo(
    () => (state?.sessions ?? []).filter((r) => !r.current).sort(byRow),
    [state?.sessions],
  );
  // Nothing live, nothing on screen: the frame has rows and none, and no roster.
  const nothingLive = state !== null && state.sessions !== undefined && state.sessions.length === 0 && state.agents.length === 0;

  const watchAgain = useCallback(() => {
    setDismissed(false);
    setAwaySince(null);
  }, []);

  const watchState = useMemo(
    () => ({ dismissed, requestStopWatching: () => setPendingDismiss(true), watchAgain }),
    [dismissed, watchAgain],
  );

  // The launcher announces a new team at a console that is already running for
  // another one. Ref-guarded because main.tsx mounts under StrictMode, and a
  // second POST would tear the ingest down and rebuild it twice.
  const announced = useRef(false);
  useEffect(() => {
    const target = store.announcedTeam;
    if (!target || announced.current || !state || target === state.teamName) return;
    announced.current = true;
    void postJson(`/api/teams/${encodeURIComponent(target)}/select`);
  }, [state, store.announcedTeam]);

  // A `/s/:sessionId` URL (task #4) announces itself the same way, but against
  // its own endpoint and without waiting on `state` first — the client cannot
  // tell which team, if any, that lead drives, so the server's no-op guard, not
  // a teamName comparison here, is what makes a same-session reload a no-op.
  const sessionAnnounced = useRef(false);
  useEffect(() => {
    const target = store.sessionRoute;
    if (!target || sessionAnnounced.current) return;
    sessionAnnounced.current = true;
    void postJson(`/api/select-session/${encodeURIComponent(target)}`);
  }, [store.sessionRoute]);

  // A bare open — no `?team=` announce, no `/s/` route — otherwise lands on
  // whatever the server happened to be showing at boot. When a session in the
  // same folder is busy and the one on screen is not, it lands there instead,
  // read off the frame's own `sessions`. Ref-guarded like the two effects above, so it runs once per
  // page load and never fights a later manual switch; an announce or a route
  // still wins outright.
  const autoResumed = useRef(false);
  useEffect(() => {
    if (autoResumed.current || store.announcedTeam || store.sessionRoute || !state?.sessions) return;
    autoResumed.current = true;
    // Inside the operator's folder — the same scope the picker opens on — so a
    // bare open stays where the operator works. The switch is server-wide, so it
    // only moves to a row strictly more active (busy over idle), never between
    // equals: the frame carries no recency to break that tie on.
    const scope = scopeOf(state.sessions, readStoredFolder());
    const rows = state.sessions.filter((r) => scope === null || r.folder === scope).sort(byRow);
    const target = rows[0];
    const here = rows.find((r) => r.current);
    if (!target || target.current || (here && here.busy === target.busy)) return;
    void postJson(`/api/select-session/${encodeURIComponent(target.id)}`);
  }, [state, store.announcedTeam, store.sessionRoute]);

  // The wall pins the lead leftmost then departed last, so column navigation
  // (h/l) walks the same order — App needs only the names, not the rendered
  // columns.
  const wallOrder = state ? rosterOrder(state.agents).map((a) => a.name) : [];

  function isDeparted(name: string): boolean {
    return state?.agents.find((a) => a.name === name)?.status === 'departed';
  }

  // Stopping is confirmed before it is sent, and the request is remembered so
  // the row can say it is pending. Both are console-local: a stop is a
  // shutdown_request in the agent's inbox, so nothing observable changes until
  // the agent reaches its next turn boundary and acts on it.
  const [stopping, setStopping] = useState<Agent | null>(null);
  const [stopRequested, setStopRequested] = useState<ReadonlySet<string>>(() => new Set());

  const sendStop = useCallback((name: string) => {
    setStopRequested((prev) => new Set(prev).add(name));
    void postJson(`/api/agents/${encodeURIComponent(name)}/stop`);
  }, []);

  const confirmStop = useCallback(() => {
    if (!stopping) return;
    // Teammates run inside the lead's session, so ending it ends them. The
    // request is sent to each one as well rather than left implicit — an agent
    // that never got one has no reason to wind down.
    const targets = stopping.isLead
      ? [stopping.name, ...(state?.agents ?? []).filter((a) => !a.isLead).map((a) => a.name)]
      : [stopping.name];
    for (const name of targets) if (!isDeparted(name)) sendStop(name);
    setStopping(null);
  }, [stopping, state, sendStop]);

  const askStop = useCallback(
    (name: string) => {
      const agent = state?.agents.find((a) => a.name === name);
      if (agent && agent.status !== 'departed' && !state?.readOnly) setStopping(agent);
    },
    [state],
  );

  // "End it for real" on the left-session screen is the same destructive verb
  // as ending it from the wall — same confirmation, same fan-out to every
  // teammate — just reached from a dismissed session instead of a live view.
  const endForReal = useCallback(() => {
    const lead = state?.agents.find((a) => a.isLead);
    if (lead) askStop(lead.name);
  }, [state, askStop]);

  // Built ONCE and handed to every view, from the roster's OWN order — the
  // append-only join order out of `members[]`, not the wall's.
  //
  // Two different invariants, and both are needed. One cast for every view is
  // what stops the wall and the grid disagreeing. Seeding it from an order that
  // never re-sorts is what stops the team being recast over TIME: the theme's
  // spare characters are dealt out in the order they arrive, and the wall's
  // order moves a departed teammate to the end, so a single departure would
  // deal every spare-drawn agent one seat along mid-session.
  const cast = useMemo(
    () => buildCast(state?.agents ?? [], appearance.settings.movieTheme),
    [state?.agents, appearance.settings.movieTheme],
  );
  // First light (handoff 2a): one agent and nothing said yet. The first
  // transcript line hands over to the solo stream, the first teammate to the
  // wall — both a cut. Wall view only: the other views are themselves.
  const firstLight =
    state !== null && state.agents.length === 1 && state.agents[0].transcript.length === 0 && view === 'wall' && !dismissed;
  const firstLightNote = firstLight ? `messages go to ${leadNameOf(cast, state.agents[0])} until a teammate joins` : undefined;

  // Above the `!state` return: every hook has to run on the frame before the
  // first snapshot lands too, or the hook order changes between renders.
  const stopControl = useMemo(
    () => ({
      requested: stopRequested,
      ask: (a: Agent) => setStopping(a),
      // No frame yet means no team to act on, so the control stays inert.
      readOnly: state?.readOnly ?? true,
    }),
    [stopRequested, state?.readOnly],
  );

  // Questions closed with Cancel on the review tab: still pending, only hidden
  // in this tab, so a reload brings them back as the handoff asks.
  const [cancelledQuestions, setCancelledQuestions] = useState<ReadonlySet<string>>(() => new Set());
  const cancelQuestion = useCallback((id: string) => setCancelledQuestions((s) => new Set(s).add(id)), []);
  const question = firstQuestion(state?.needsYou ?? [], cancelledQuestions);
  const pendingQuestions = useMemo(
    () => (state?.needsYou ?? []).filter((item) => (item.questions?.length ?? 0) > 0),
    [state?.needsYou],
  );
  const questionLead = state?.agents.find((a) => a.isLead)?.name ?? 'team-lead';

  useKeyboard({
    agents: wallOrder,
    view,
    focused: store.agent,
    setFocused: store.setAgent,
    setView: store.setView,
    interrupt: (name) => {
      if (!isDeparted(name)) void postJson(`/api/agents/${encodeURIComponent(name)}/interrupt`);
    },
    // `x` opens the same confirmation the control does — the keystroke used to
    // send the request outright, which is a hard thing to undo from one key.
    stop: askStop,
    toggleTeams,
    // The patch and the question each own the keyboard while open, or Esc
    // interrupts the focused agent instead of closing or declining.
    suspended: store.openDiff !== null || question !== null,
  });

  const splash = splashDone ? null : (
    <Splash
      reduced={!appearance.settings.motion || prefersReducedMotion()}
      onDone={() => setSplashDone(true)}
    />
  );

  if (!state) {
    return (
      <>
        <div className="console" style={appearance.vars} data-motion={appearance.settings.motion ? 'on' : 'off'}>
          <main className="console-body" />
        </div>
        {splash}
      </>
    );
  }

  // Workflow mode is a different shell, not a different view: no roster, no
  // task list, no inboxes, no composer, and `RUN` where the team bar says
  // `TEAM`. The chrome is the same chrome, so the providers it reads are the
  // same ones: the picker shows what this browser has hidden, and the gear
  // writes the appearance the leaves below it read.
  //
  // The server's mode is only the DEFAULT, and it hands a team the mode whenever
  // there is one — so a workflow launched beside a live team is on the frame and
  // undrawable until the operator asks for it. Asking is `store.run`, and it
  // wins in either mode; the team keeps running behind it either way.
  const runs = state.workflows ?? [];
  const run = runs.find((r) => r.runId === store.run) ?? (state.mode === 'workflow' ? runs[0] : undefined);
  if (run) {
    return (
      <>
      <SettingsContext.Provider value={appearance.settings}>
      <WatchContext.Provider value={watchState}>
      <div className="console" style={appearance.vars} data-motion={appearance.settings.motion ? 'on' : 'off'}>
        <Workflow
          run={run}
          runs={runs}
          onSelectRun={store.setRun}
          backToTeam={state.mode === 'team' ? (state.sessionName ?? state.teamName) : undefined}
          now={now}
          teamName={state.teamName || state.leadSessionId}
          sessionName={state.sessionName}
          switching={state.switching}
          teamsOpen={teamsOpen}
          onTeamsOpenChange={setTeamsOpen}
          appearance={appearance}
          subagents={state.subagents}
          build={state.build}
          sessions={state.sessions ?? []}
        />
        <QuestionModal item={question} leadName={questionLead} onCancel={cancelQuestion} onDeclined={focusComposer} />
      </div>
      </WatchContext.Provider>
      </SettingsContext.Provider>
      {splash}
      </>
    );
  }

  return (
    <>
    <StopContext.Provider value={stopControl}>
    <SettingsContext.Provider value={appearance.settings}>
    <CastContext.Provider value={cast}>
    <DiffContext.Provider value={store.setOpenDiff}>
    <WatchContext.Provider value={watchState}>
    <PendingQuestionsContext.Provider value={pendingQuestions}>
    <div
      className="console"
      style={appearance.vars}
      data-motion={appearance.settings.motion ? 'on' : 'off'}
    >
      <StatusBar
        state={state}
        view={view}
        onViewChange={store.setView}
        now={now}
        teamsOpen={teamsOpen}
        onTeamsOpenChange={setTeamsOpen}
        onSelectRun={store.setRun}
        appearance={appearance}
        solo={solo}
        hasSubagents={hasSubagents}
        dimmed={firstLight}
      />
      <main className="console-body">
        {nothingLive ? (
          <NoSessions
            others={elsewhere}
            onSwitchTo={(id) => void postJson(`/api/select-session/${encodeURIComponent(id)}`)}
          />
        ) : dismissed ? (
          <LeftSession
            state={state}
            now={now}
            awaySince={awaySince}
            elsewhere={elsewhere}
            onWatchAgain={watchState.watchAgain}
            onEndForReal={endForReal}
            onSwitchTo={(id) => void postJson(`/api/select-session/${encodeURIComponent(id)}`)}
          />
        ) : (
        <>
        {view === 'wall' && firstLight && <FirstLight lead={state.agents[0]} />}
        {view === 'wall' && !firstLight && (
          <Wall
            agents={state.agents}
            focused={store.agent}
            revealAlso={alsoReveal}
            onFocus={store.setAgent}
            now={now}
            readOnly={state.readOnly}
            widths={store.widths}
            onWidthChange={store.setWidth}
            tasks={state.tasks}
            onOpenMail={(name) => {
              setMailFor(name);
              store.setAgent(name);
              store.setView('comms');
            }}
            subagents={state.subagents}
          />
        )}
        {view === 'overview' && (
          <Overview
            agents={state.agents}
            tasks={state.tasks}
            mail={state.mail}
            needsYou={state.needsYou}
            brief={state.brief}
            sessionId={state.leadSessionId}
            startedAt={state.startedAt}
            focused={store.agent}
            onOpenWall={(name) => {
              store.setAgent(name);
              store.setView('wall');
            }}
            now={now}
            readOnly={state.readOnly}
            solo={solo}
          />
        )}
        {view === 'comms' && (
          <Comms
            agents={state.agents}
            mail={state.mail}
            tasks={state.tasks}
            openThread={mailFor}
            onFocus={store.setAgent}
            onShowInWall={(name, reveal) => {
              store.setAgent(name);
              setAlsoReveal(reveal ?? null);
              store.setView('wall');
            }}
            now={now}
            readOnly={state.readOnly}
          />
        )}
        {view === 'tasks' && <Tasks tasks={state.tasks} teamName={state.teamName} />}
        {view === 'plan' && state.plan && <Plan plan={state.plan} />}
        {view === 'trace' && traceLead && (
          <Trace
            agent={traceLead.name}
            model={traceLead.model}
            subagents={
              state.subagents?.[traceLead.name] ?? Object.values(state.subagents ?? {}).flat()
            }
            now={now}
            selected={traceSelected}
            onSelect={setTraceSelected}
          />
        )}
        {view === 'rail' && (
          <Rail
            agents={state.agents}
            focused={store.agent}
            onFocus={store.setAgent}
            now={now}
            readOnly={state.readOnly}
            subagents={state.subagents}
          />
        )}
        {view === 'grid' && (
          <Grid
            agents={state.agents}
            focused={store.agent}
            onFocus={store.setAgent}
            now={now}
            subagents={state.subagents}
          />
        )}
        {view === 'usage' && (
          <Usage
            mode="team"
            state={state}
            now={now}
            focused={store.agent}
            onFocus={(name) => {
              store.setAgent(name);
              store.setView('wall');
            }}
            spendSamples={spendSamples}
          />
        )}
        </>
        )}
      </main>
      <DiffModal diff={store.openDiff} onClose={() => store.setOpenDiff(null)} />
      <QuestionModal item={question} leadName={questionLead} onCancel={cancelQuestion} onDeclined={focusComposer} />
      <StopConfirm target={stopping} onConfirm={confirmStop} onCancel={() => setStopping(null)} />
      <WatchConfirm
        show={pendingDismiss}
        onConfirm={() => {
          setAwaySince({ at: Date.now(), cost: state.totalCostUsd });
          setDismissed(true);
          setPendingDismiss(false);
        }}
        onCancel={() => setPendingDismiss(false)}
      />
      <NeedsYou items={state.needsYou} readOnly={state.readOnly} now={now} dimmed={firstLight} note={firstLightNote} />
      <Panel agents={state.agents} focusedAgent={store.agent} onFocusAgent={store.setAgent} />
    </div>
    </PendingQuestionsContext.Provider>
    </WatchContext.Provider>
    </DiffContext.Provider>
    </CastContext.Provider>
    </SettingsContext.Provider>
    </StopContext.Provider>
    {splash}
    </>
  );
}
