import { GitCommitHorizontal, GitPullRequest, GitPullRequestArrow } from "lucide-react";
import type { GithubData, PullRequest } from "../lib/ipc";
import { Tile } from "./Tile";

export function checksState(prs: PullRequest[]): "failure" | "pending" | "success" | "none" {
  if (prs.some((p) => p.checks === "FAILURE" || p.checks === "ERROR")) return "failure";
  if (prs.some((p) => p.checks === "PENDING" || p.checks === "EXPECTED")) return "pending";
  if (prs.some((p) => p.checks === "SUCCESS")) return "success";
  return "none";
}

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return <span className="badge">{count > 99 ? "99+" : count}</span>;
}

export function GithubReviewWidget({ data }: { data: GithubData | null }) {
  const count = data?.reviewCount ?? 0;
  return (
    <Tile kind="github-review" label={data?.error ?? `${count} PR(s) aguardando seu review`}>
      <GitPullRequest size={22} />
      <Badge count={count} />
      {data?.error && <span className="status-dot failure" />}
    </Tile>
  );
}

export function GithubMineWidget({ data }: { data: GithubData | null }) {
  const count = data?.myPrCount ?? 0;
  const state = checksState(data?.myPrs ?? []);
  return (
    <Tile kind="github-mine" label={`${count} PR(s) seus abertos`}>
      <GitPullRequestArrow size={22} />
      <Badge count={count} />
      {state !== "none" && <span className={`status-dot ${state}`} />}
    </Tile>
  );
}

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}

export function GithubCommitsWidget({ data }: { data: GithubData | null }) {
  const todayCount = data?.commits.filter((c) => isToday(c.date)).length ?? 0;
  return (
    <Tile kind="github-commits" label={`Commits recentes (${todayCount} hoje)`}>
      <GitCommitHorizontal size={24} />
      <Badge count={todayCount} />
    </Tile>
  );
}

export function contributionLevel(count: number, max: number): number {
  if (count === 0) return 0;
  return Math.min(4, Math.ceil((count / Math.max(1, max)) * 4));
}

export type ContributionDay = GithubData["weeks"][number][number];

/**
 * Completa as semanas para 7 dias: a primeira semana do calendário começa no meio (vazios no
 * topo) e a atual ainda não terminou (vazios embaixo). Sem isso as colunas esticadas ficariam
 * desalinhadas.
 */
export function padWeeks(weeks: ContributionDay[][]): (ContributionDay | null)[][] {
  return weeks.map((week, i) => {
    const missing = Array<null>(Math.max(0, 7 - week.length)).fill(null);
    return i === 0 && weeks.length > 1 ? [...missing, ...week] : [...week, ...missing];
  });
}

export function HeatmapGrid({ weeks, className }: { weeks: ContributionDay[][]; className: string }) {
  const max = Math.max(1, ...weeks.flat().map((d) => d.count));
  return (
    <div className={className}>
      {padWeeks(weeks).map((week, i) => (
        <div key={i} className="heat-col">
          {week.map((day, j) =>
            day ? (
              <span
                key={day.date}
                className={`heat l${contributionLevel(day.count, max)}`}
                title={`${day.count} contribuição(ões) em ${new Date(day.date + "T12:00").toLocaleDateString("pt-BR")}`}
              />
            ) : (
              <span key={`empty-${j}`} className="heat empty" />
            ),
          )}
        </div>
      ))}
    </div>
  );
}

export function ContributionsWidget({ data, wide }: { data: GithubData | null; wide: boolean }) {
  const weeks = (data?.weeks ?? []).slice(wide ? -20 : -7);
  return (
    <Tile
      kind="github-contrib"
      wide={wide}
      label={`${data?.totalContributions ?? 0} contribuições no último ano`}
      className="contrib-tile"
    >
      <HeatmapGrid weeks={weeks} className="mini-heatmap" />
    </Tile>
  );
}
