import { BottomNav } from "./components/BottomNav";
import { Header } from "./components/Header";
import { RemoteGate } from "./components/RemoteGate";
import { ReviewScreen } from "./components/ReviewScreen";
import { Toast } from "./components/Toast";
import { ConfirmModal } from "./components/modals/ConfirmModal";
import { EditMatchModal } from "./components/modals/EditMatchModal";
import { ScorekeeperSheet } from "./components/modals/ScorekeeperSheet";
import { SetupWizardModal } from "./components/modals/SetupWizardModal";
import { ShareRankingsModal } from "./components/modals/ShareRankingsModal";
import { ManageTab } from "./components/tabs/ManageTab";
import { MatchesTab } from "./components/tabs/MatchesTab";
import { RankingsTab } from "./components/tabs/RankingsTab";
import { SessionTab } from "./components/tabs/SessionTab";
import { copy } from "./lib/copy";
import { useMyPlayer } from "./hooks/useMyPlayer";
import { useSessionStore } from "./hooks/useSessionStore";
import styles from "./App.module.css";

function App() {
  const store = useSessionStore();
  const { remote } = store;
  const [youId, setYouId] = useMyPlayer();

  // A shared `?view=` link: gate on picking a role, entering the Umpire PIN,
  // and the session actually being reachable, before showing anything else.
  // Player and Umpire both fall through to the normal app once past this —
  // only Player then renders read-only (see isReadOnlyPlayer below).
  if (remote.isRemoteMode) {
    const ready = remote.role && remote.connected && !remote.missing && remote.firebaseConfigured;
    if (!ready) return <RemoteGate {...remote} />;
  }

  const isReadOnlyPlayer = remote.isRemoteMode && remote.role === "player";

  if (store.isReviewMode) {
    return (
      <>
        <ReviewScreen {...store.review} readOnly={isReadOnlyPlayer} />
        <ShareRankingsModal {...store.shareRankings} />
        <Toast message={store.toast.message} />
      </>
    );
  }

  // Once the schedule has passed, a viewer is shown the final standings, not a live session.
  const sessionOver = isReadOnlyPlayer && store.session.scheduleOver;

  return (
    <div className={styles.app}>
      <div className={styles.blobTopRight} />
      <div className={styles.blobBottomLeft} />
      <div className={styles.blobCenter} />
      <div className={styles.dotGrid} />

      <Header {...store.header} readOnly={isReadOnlyPlayer} />

      {store.photoReminder && (
        <div className={styles.photoBanner}>
          <span>{copy.banner.photo(store.photoReminder.minutesLeft)}</span>
          <button className={styles.photoBannerBtn} onClick={store.photoReminder.onDismiss}>
            {copy.common.done}
          </button>
        </div>
      )}

      {store.courtCloseReminders.map((r) => (
        <div className={styles.photoBanner} key={r.courtId}>
          <span>{r.message}</span>
          <span className={styles.bannerActions}>
            {r.onPause && (
              <button className={styles.photoBannerBtn} onClick={r.onPause}>
                {copy.banner.pauseNow}
              </button>
            )}
            <button className={styles.photoBannerBtn} onClick={r.onKeepOpen}>
              {copy.banner.keepOpen}
            </button>
          </span>
        </div>
      ))}

      {isReadOnlyPlayer && <div className={styles.readOnlyBanner}>{copy.banner.viewOnly}</div>}

      <div className={styles.main}>
        {store.tabs.active === "session" && (
          <SessionTab
            {...store.session}
            hideTier={isReadOnlyPlayer}
            readOnly={isReadOnlyPlayer}
            onSeeAllMatches={() => store.tabs.setActiveTab("matches")}
            rankings={store.rankings.rankingsVM}
            onSeeRankings={() => store.tabs.setActiveTab("rankings")}
            youId={youId}
            onSetYou={setYouId}
          />
        )}
        {store.tabs.active === "matches" && <MatchesTab {...store.matches} readOnly={isReadOnlyPlayer} />}
        {store.tabs.active === "rankings" && (
          <RankingsTab {...store.rankings} hideTier={isReadOnlyPlayer} ended={sessionOver} youId={isReadOnlyPlayer ? youId : null} />
        )}
        {store.tabs.active === "manage" && !isReadOnlyPlayer && <ManageTab {...store.manage} />}
      </div>

      <BottomNav active={store.tabs.active} onChange={store.tabs.setActiveTab} hideManage={isReadOnlyPlayer} />

      {!isReadOnlyPlayer && (
        <>
          <ScorekeeperSheet {...store.scorekeeper} />
          <EditMatchModal {...store.editMatch} />
          <SetupWizardModal {...store.setup} />
          <ConfirmModal {...store.confirm} />
        </>
      )}
      <ShareRankingsModal {...store.shareRankings} />
      <Toast message={store.toast.message} />
    </div>
  );
}

export default App;
