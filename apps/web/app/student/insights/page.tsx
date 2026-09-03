'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Line, LineChart, ResponsiveContainer } from 'recharts';

interface SubjectInsight {
  subjectName: string;
  percentage: number;
  trend: 'improving' | 'declining' | 'stable';
  activitiesCount: number;
  weakestType: string;
  recentScores: number[];
}

interface Insights {
  overallPercentage: number;
  overallTrend: 'improving' | 'declining' | 'stable';
  bestSubject: { name: string; percentage: number } | null;
  weakestSubject: { name: string; percentage: number } | null;
  subjectInsights: SubjectInsight[];
  recommendations: string[];
}

function trendIcon(trend: string): string {
  if (trend === 'improving') return '📈';
  if (trend === 'declining') return '📉';
  return '➖';
}

function gradeLetterFor(pct: number): string {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  return 'F';
}

export default function StudentInsightsPage() {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ success: boolean; data: { insights?: null; reason?: string } & Partial<Insights> }>(
        '/api/student/ai-insights'
      )
      .then((res) => {
        const data = res.data.data;
        if (data.insights === null) {
          setReason(data.reason ?? 'Complete more activities for AI insights');
          setInsights(null);
        } else {
          setInsights(data as Insights);
        }
      })
      .catch(() => setError('Failed to load insights.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Analyzing your progress...</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">My Learning Insights 🤖</h1>

      {!insights ? (
        <Card>
          <CardContent className="space-y-2 pt-6 text-center">
            <p className="text-sm text-muted-foreground">{reason}</p>
            <p className="text-xs text-muted-foreground">
              💡 Tip: submit and get graded on a few more activities to unlock personalized insights.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Overview</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <div className="text-xs text-muted-foreground">Overall Performance</div>
                <div className="mt-1 text-lg font-semibold">
                  {insights.overallPercentage}% ({gradeLetterFor(insights.overallPercentage)})
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Trend</div>
                <div className="mt-1 text-lg font-semibold capitalize">
                  {trendIcon(insights.overallTrend)} {insights.overallTrend}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Best Subject</div>
                <div className="mt-1 text-lg font-semibold">
                  {insights.bestSubject ? `⭐ ${insights.bestSubject.name} (${insights.bestSubject.percentage}%)` : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Needs Attention</div>
                <div className="mt-1 text-lg font-semibold">
                  {insights.weakestSubject
                    ? `⚠️ ${insights.weakestSubject.name} (${insights.weakestSubject.percentage}%)`
                    : '—'}
                </div>
              </div>
            </CardContent>
          </Card>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">By Subject</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {insights.subjectInsights.map((s) => (
                <Card key={s.subjectName}>
                  <CardContent className="space-y-3 pt-6">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{s.subjectName}</span>
                      <span className="text-sm font-semibold">
                        {s.percentage}% {trendIcon(s.trend)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={
                          s.percentage >= 70 ? 'h-full bg-green-500' : s.percentage >= 50 ? 'h-full bg-yellow-500' : 'h-full bg-red-500'
                        }
                        style={{ width: `${Math.min(100, s.percentage)}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Trend: <span className="capitalize">{s.trend}</span>
                    </div>
                    <div className="text-xs text-muted-foreground capitalize">Weak area: {s.weakestType}</div>
                    <div className="text-xs text-muted-foreground">
                      Recent: {s.recentScores.map((sc) => `${Math.round(sc)}%`).join(', ')}
                    </div>
                    {s.recentScores.length > 1 && (
                      <div className="h-10 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={s.recentScores.map((v, i) => ({ i, v }))}>
                            <Line
                              type="monotone"
                              dataKey="v"
                              stroke={s.trend === 'declining' ? '#ef4444' : '#22c55e'}
                              strokeWidth={2}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recommendations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {insights.recommendations.map((r, i) => (
                <p key={i} className="text-sm">
                  💡 {r}
                </p>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
