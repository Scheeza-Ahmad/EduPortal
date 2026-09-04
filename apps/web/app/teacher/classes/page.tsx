'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ClassItem {
  id: string;
  number: number;
  section: string;
  wing: 'junior' | 'senior' | 'both';
  classTeacherId: string | null;
}

interface SubjectItem {
  id: string;
  name: string;
  classId: string;
}

export default function MyClassesPage() {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ success: boolean; data: { classes: ClassItem[] } }>('/api/teacher/classes'),
      api.get<{ success: boolean; data: { subjects: SubjectItem[] } }>('/api/teacher/subjects'),
    ])
      .then(([classesRes, subjectsRes]) => {
        setClasses(classesRes.data.data.classes);
        setSubjects(subjectsRes.data.data.subjects);
      })
      .catch(() => setError('Failed to load your classes.'))
      .finally(() => setLoading(false));
  }, []);

  function subjectsFor(classId: string): SubjectItem[] {
    return subjects.filter((s) => s.classId === classId);
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading your classes...</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">My Classes</h1>

      {classes.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            You aren&apos;t assigned to any classes yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <Link key={c.id} href={`/teacher/classes/${c.id}`} className="block">
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Class {c.number}
                    {c.section}
                  </CardTitle>
                  <Badge variant="outline" className="capitalize">
                    {c.wing} wing
                  </Badge>
                </div>
                {c.classTeacherId === currentUserId && (
                  <Badge className="w-fit">Class Teacher</Badge>
                )}
              </CardHeader>
              <CardContent>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Subjects you teach here
                </p>
                {subjectsFor(c.id).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    None — you&apos;re the class teacher only.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {subjectsFor(c.id).map((s) => (
                      <Badge key={s.id} variant="secondary" className="text-xs">
                        {s.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
