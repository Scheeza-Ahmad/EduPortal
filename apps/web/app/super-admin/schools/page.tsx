'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface School {
  id: string;
  name: string;
  city: string;
  phone: string | null;
  adminId: string | null;
  isActive: boolean;
  featureParentPortal: boolean;
  featureAi: boolean;
  featureSms: boolean;
  featureUrdu: boolean;
}

interface FormState {
  name: string;
  city: string;
  phone: string;
}

const EMPTY_FORM: FormState = { name: '', city: '', phone: '' };

export default function SchoolsPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function loadSchools() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { schools: School[] } }>(
        '/api/super/schools?limit=100'
      );
      setSchools(res.data.data.schools);
    } catch {
      setError('Failed to load schools.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSchools();
  }, []);

  function openAddDialog() {
    setEditingSchool(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEditDialog(school: School) {
    setEditingSchool(school);
    setForm({ name: school.name, city: school.city, phone: school.phone ?? '' });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const payload = {
      name: form.name,
      city: form.city,
      phone: form.phone || undefined,
    };

    try {
      if (editingSchool) {
        await api.patch(`/api/super/schools/${editingSchool.id}`, payload);
      } else {
        await api.post('/api/super/schools', payload);
      }
      setDialogOpen(false);
      await loadSchools();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      setFormError(axiosErr.response?.data?.error ?? 'Failed to save school.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(school: School) {
    setTogglingId(school.id);
    try {
      if (school.isActive) {
        await api.delete(`/api/super/schools/${school.id}`);
      } else {
        await api.patch(`/api/super/schools/${school.id}`, { isActive: true });
      }
      await loadSchools();
    } catch {
      setError('Failed to update school status.');
    } finally {
      setTogglingId(null);
    }
  }

  function activeFeatures(school: School): string[] {
    const features: string[] = [];
    if (school.featureParentPortal) features.push('Parent Portal');
    if (school.featureAi) features.push('AI');
    if (school.featureSms) features.push('SMS');
    if (school.featureUrdu) features.push('Urdu');
    return features;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Schools</h1>
        <Button onClick={openAddDialog}>Add School</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Schools</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading schools...</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Features</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schools.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No schools yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  schools.map((school) => (
                    <TableRow key={school.id}>
                      <TableCell className="font-medium">{school.name}</TableCell>
                      <TableCell>{school.city}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {school.adminId ? school.adminId.slice(0, 8) : 'Not assigned'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={school.isActive ? 'default' : 'secondary'}>
                          {school.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {activeFeatures(school).length === 0 ? (
                            <span className="text-xs text-muted-foreground">None</span>
                          ) : (
                            activeFeatures(school).map((f) => (
                              <Badge key={f} variant="outline" className="text-xs">
                                {f}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="sm" onClick={() => openEditDialog(school)}>
                          Edit
                        </Button>
                        <Button
                          variant={school.isActive ? 'destructive' : 'default'}
                          size="sm"
                          disabled={togglingId === school.id}
                          onClick={() => handleToggleActive(school)}
                        >
                          {togglingId === school.id
                            ? '...'
                            : school.isActive
                              ? 'Disable'
                              : 'Enable'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSchool ? 'Edit School' : 'Add School'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="school-name">Name</Label>
              <Input
                id="school-name"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="school-city">City</Label>
              <Input
                id="school-city"
                required
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="school-phone">Phone (optional)</Label>
              <Input
                id="school-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>

            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}

            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : editingSchool ? 'Save Changes' : 'Create School'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
