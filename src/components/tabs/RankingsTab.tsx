import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LevelPicker } from "../LevelPicker";
import { ShareNodesIcon } from "../icons";
import { copy } from "../../lib/copy";
import { useRankingSort } from "../../hooks/useRankingSort";
import { avatarStyle } from "../../lib/playerColor";
import { sortRankings } from "../../lib/rankingSort";
import { RANK_MIN_GAMES } from "../../lib/session";
import type { SessionStore } from "../../hooks/useSessionStore";
import styles from "./RankingsTab.module.css";

type RankingsTabProps = SessionStore["rankings"] & {
  hideTier?: boolean;
  /** The session has ended: these are the final standings. */
  ended?: boolean;
  /** Who this viewer says they are; their row is marked. */
  youId?: string | null;
};
type Row = RankingsTabProps["rankingsVM"][number];

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

// Wins/losses behind a rounded percentage ("won 2 of 3" reads better than "67%").
const share = (pct: number, games: number) => Math.round((pct * games) / 100);

// "Tougher" only once the gap is clear; a few stray games shouldn't read as a verdict.
const strength = (edge: number) => (edge >= 0.25 ? copy.rankings.strength.stronger : edge <= -0.25 ? copy.rankings.strength.weaker : copy.rankings.strength.average);

/** Last results as W/L letters (filled for a win, hollow for a loss), so form never depends on colour. */
function FormDots({ form }: { form: number[] }) {
  const label = copy.rankings.formLabel(form.map((res) => (res > 0 ? "W" : "L")));
  return (
    <div className={styles.formDots} role="img" aria-label={label}>
      {form.length === 0
        ? Array.from({ length: 5 }).map((_, i) => <span key={i} className={styles.formDotEmpty} />)
        : form.map((res, i) => (
            <span key={i} className={res > 0 ? styles.formDotWin : styles.formDotLoss} aria-hidden="true">
              {res > 0 ? "W" : "L"}
            </span>
          ))}
    </div>
  );
}

interface RankingRowProps {
  r: Row;
  resultMode: RankingsTabProps["resultMode"];
  canEdit: boolean;
  hideTier?: boolean;
  isYou: boolean;
}

function RankingRow({ r, resultMode, canEdit, hideTier, isYou }: RankingRowProps) {
  const [open, setOpen] = useState(false);
  // Medals and their tint follow the medal rule, not just the list position.
  const topRank = r.medal;
  // With results, the score is the headline and the record sits small beneath it.
  const showRate = resultMode !== "none" && r.played > 0;
  const hasInsights = r.favPartner !== "—" || r.toughOpp !== "—";
  const rankCell = topRank ? MEDAL[topRank] : r.section === "ranked" ? r.rank : "";
  return (
    <details
      className={`${styles.row} ${topRank ? styles["top" + topRank] : ""} ${isYou ? styles.you : ""}`}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className={styles.summary} aria-expanded={open}>
        <div className={styles.summaryTop}>
          <span className={styles.rank} role={topRank ? "img" : undefined} aria-label={topRank ? copy.rankings.rank(topRank) : undefined}>
            {rankCell}
          </span>
          <div className={`${styles.avatar} ${topRank ? styles["avatarTop" + topRank] : ""}`} style={avatarStyle(r.name)}>
            {r.initials}
          </div>
          <span className={styles.name}>
            {r.name} {!hideTier && <span className={styles.level}>Tier {r.level}</span>}
            {isYou && <span className={styles.youTag}>{copy.rankings.you}</span>}
          </span>
          {showRate && <span className={styles.winBig}>{r.score}</span>}
          <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`} aria-hidden="true">
            ›
          </span>
        </div>
        <div className={styles.summaryBottom}>
          {/* matches played comes first so it can be scanned down the list: "Played 7 · 5–2 · 71% wins" */}
          <span className={styles.stats}>
            <strong className={styles.played}>{copy.rankings.played(r.matchesPlayed)}</strong>
            {r.behind && (
              <span className={styles.behindTag}>
                {copy.rankings.behind}
                <span className="srOnly">: {copy.rankings.behindHint}</span>
              </span>
            )}
            {/* with the Behind tag the record drops to its own line, so a "·" never starts a wrapped line */}
            {showRate && (
              <span className={`${styles.rates} ${r.behind ? styles.ratesOwnLine : ""}`}>
                {r.behind ? "" : "· "}
                {copy.rankings.summary(r.wins, r.losses, r.winPct)}
              </span>
            )}
          </span>
          <FormDots form={r.recentForm} />
        </div>
        {r.note && <div className={styles.rowNote}>{r.note}</div>}
      </summary>
      <div className={styles.detail}>
        {resultMode !== "none" && r.played > 0 && (
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>{copy.rankings.detail.thisSession}</span>
            <span>{copy.rankings.detail.won(r.wins)}</span>
          </div>
        )}
        {resultMode === "score" && r.played > 0 && r.pointsPct !== null && (
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>{copy.rankings.detail.points}</span>
            <span>
              <strong className={styles.detailStrong}>{copy.rankings.detail.pointsValue(r.pointsPct, r.pointsFor, r.pointsAgainst)}</strong>
            </span>
          </div>
        )}
        {resultMode !== "none" && r.played > 0 && (
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>{copy.rankings.detail.opponents}</span>
            <span>
              <strong className={styles.detailStrong}>{strength(r.oppEdge)}</strong>
            </span>
          </div>
        )}
        {r.partnersCount > 0 && (
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>{copy.rankings.detail.partners}</span>
            <span>
              <strong className={styles.detailStrong}>{copy.rankings.detail.differentPartners(r.partnersCount)}</strong>
            </span>
          </div>
        )}
        {r.favPartner !== "—" && (
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>{copy.rankings.detail.bestPartner}</span>
            <span>{copy.rankings.detail.bestPartnerValue(r.favPartner, share(r.favPartnerWin, r.favPartnerGames), r.favPartnerGames)}</span>
          </div>
        )}
        {r.toughOpp !== "—" && (
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>{copy.rankings.detail.toughestOpponent}</span>
            <span>{copy.rankings.detail.toughestValue(r.toughOpp, share(r.toughOppLoss, r.toughOppGames), r.toughOppGames)}</span>
          </div>
        )}
        {r.section === "tooFew" && r.played > 0 && <div className={styles.fewNote}>{copy.rankings.tooFewNote(r.played, r.mostGames, RANK_MIN_GAMES)}</div>}
        {r.section === "notRanked" && <div className={styles.fewNote}>{copy.rankings.guestNote}</div>}
        {!hasInsights && r.section !== "notRanked" && <div>{copy.rankings.noPartnerStats}</div>}
        {!hideTier && canEdit && (
          <div className={styles.tierRow}>
            <span className={styles.tierLabel}>{copy.rankings.detail.tier}</span>
            <LevelPicker value={r.level} onChange={r.onSetLevel} size="sm" />
          </div>
        )}
        {canEdit && r.onToggleCounted && resultMode !== "none" && (
          <button className={styles.countBtn} onClick={r.onToggleCounted}>
            {r.inRankings ? copy.rankings.detail.exclude : copy.rankings.detail.include}
          </button>
        )}
      </div>
    </details>
  );
}

export function RankingsTab({ rankingsVM, resultMode, early, canEdit, onShareRankings, hideTier, ended, youId }: RankingsTabProps) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [sort, setSort] = useRankingSort();
  const closeRef = useRef<HTMLButtonElement>(null);
  const renderRow = (r: Row) => <RankingRow key={r.id} r={r} resultMode={resultMode} canEdit={canEdit} hideTier={hideTier} isYou={r.id === youId} />;

  // The sheet is a real dialog: Escape closes it, and focus starts inside it.
  useEffect(() => {
    if (!infoOpen) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setInfoOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [infoOpen]);

  const byMatches = sort === "matches";
  const ranked = rankingsVM.filter((r) => r.section === "ranked");
  const tooFew = rankingsVM.filter((r) => r.section === "tooFew");
  const notRanked = rankingsVM.filter((r) => r.section === "notRanked");

  return (
    <>
      <div className={styles.section}>
        <div className={styles.titleRow}>
          <div>
            <div className={styles.titleLine}>
              <h1 className={styles.title}>{ended ? copy.rankings.finalTitle : copy.rankings.title}</h1>
              {resultMode !== "none" && (
                <button className={styles.infoBtn} onClick={() => setInfoOpen(true)} aria-label={copy.rankings.howItWorks} aria-haspopup="dialog">
                  i
                </button>
              )}
            </div>
            {rankingsVM.length > 0 && <div className={styles.subtitle}>{copy.rankings.rule[resultMode]}</div>}
            {rankingsVM.length > 1 && (
              <div className={styles.sortRow}>
                <div className={styles.segmented} role="group" aria-label={copy.rankings.sortLabel}>
                  {(["rank", "matches"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={sort === option}
                      className={`${styles.segment} ${sort === option ? styles.segmentOn : ""}`}
                      onClick={() => setSort(option)}
                    >
                      {sort === option && <span aria-hidden="true">✓ </span>}
                      {option === "rank" ? copy.rankings.sortRank : copy.rankings.sortMatches}
                    </button>
                  ))}
                </div>
                {byMatches && <span className={styles.sortHint}>{copy.rankings.sortMatchesHint}</span>}
              </div>
            )}
          </div>
          {rankingsVM.some((r) => r.rank !== null) && (
            <button className={styles.shareBtn} onClick={onShareRankings}>
              <ShareNodesIcon />
              {copy.rankings.share}
            </button>
          )}
        </div>
      </div>

      {early && <div className={styles.earlyNote}>{copy.rankings.early}</div>}

      {rankingsVM.length === 0 && <div className={styles.empty}>{copy.rankings.none}</div>}

      {resultMode === "none" || byMatches ? (
        <>
          {resultMode !== "none" && rankingsVM.some((r) => r.played > 0) && <div className={styles.columnHead}>{copy.rankings.scoreColumn}</div>}
          <div className={styles.list}>{sortRankings(rankingsVM, sort).map(renderRow)}</div>
        </>
      ) : (
        <>
          {/* the score column is named once, here, rather than under every number */}
          {rankingsVM.some((r) => r.played > 0) && <div className={styles.columnHead}>{copy.rankings.scoreColumn}</div>}
          <div className={styles.list}>{ranked.map(renderRow)}</div>
          {ranked.length === 0 && tooFew.some((r) => r.played > 0) && <div className={styles.empty}>{copy.rankings.ranksAppear(RANK_MIN_GAMES)}</div>}
          {tooFew.length > 0 && (
            <>
              <div className={styles.groupLabel}>{copy.rankings.groupTooFew}</div>
              <div className={styles.list}>{tooFew.map(renderRow)}</div>
            </>
          )}
          {notRanked.length > 0 && (
            <>
              <div className={styles.groupLabel}>{copy.rankings.groupNotRanked}</div>
              <div className={styles.list}>{notRanked.map(renderRow)}</div>
            </>
          )}
        </>
      )}

      {infoOpen &&
        createPortal(
          <div className={styles.sheetBackdrop} onClick={() => setInfoOpen(false)}>
            <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={copy.rankings.howItWorks} onClick={(e) => e.stopPropagation()}>
              <div className={styles.sheetTitle}>{copy.rankings.howItWorks}</div>
              <ol className={styles.sheetList}>
                {resultMode === "score" ? (
                  <li>
                    <strong>{copy.rankings.sheet.scoreMatch}</strong> {copy.rankings.sheet.scoreMatchBody}
                  </li>
                ) : (
                  <li>
                    <strong>{copy.rankings.sheet.winnerMatch}</strong>
                  </li>
                )}
                <li>
                  <strong>{copy.rankings.sheet.expected}</strong> {hideTier ? copy.rankings.sheet.expectedViewer : copy.rankings.sheet.expectedUmpire}
                </li>
                <li>
                  <strong>{copy.rankings.sheet.fifty}</strong> {copy.rankings.sheet.fiftyBody}
                </li>
                <li>
                  <strong>{copy.rankings.sheet.need(RANK_MIN_GAMES)}</strong>
                  {copy.rankings.sheet.needBody}
                </li>
              </ol>
              <div className={styles.sheetNote}>{copy.rankings.sheet.note}</div>
              <button className={styles.sheetClose} ref={closeRef} onClick={() => setInfoOpen(false)}>
                {copy.rankings.sheet.gotIt}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
