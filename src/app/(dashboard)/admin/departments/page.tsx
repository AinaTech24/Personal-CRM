"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Department {
  id: string;
  name: string;
  isAnalystDept: boolean;
  hasClientsModule: boolean;
  _count: { users: number };
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/departments");
    const data = await res.json();
    if (res.ok) setDepartments(data.departments);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleFlag(dept: Department, flag: "isAnalystDept" | "hasClientsModule") {
    const next = !dept[flag];
    // Optimistic — this is a low-stakes admin toggle, not worth a loading spinner per card.
    setDepartments((prev) => prev.map((d) => (d.id === dept.id ? { ...d, [flag]: next } : d)));
    const res = await fetch(`/api/departments/${dept.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [flag]: next }),
    });
    if (!res.ok) {
      // Roll back on failure rather than leave the UI lying about server state.
      setDepartments((prev) => prev.map((d) => (d.id === dept.id ? { ...d, [flag]: !next } : d)));
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setName("");
      await load();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Departments</h1>
        <p className="text-sm text-muted-foreground">Organizational units such as Development, Design, Sales.</p>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-base">New department</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex gap-2">
            <Input
              placeholder="e.g. Development"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Button type="submit" disabled={loading}>
              Add
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {departments.map((d) => (
          <Card key={d.id}>
            <CardHeader>
              <CardTitle className="text-base">{d.name}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {d._count.users} member{d._count.users === 1 ? "" : "s"}
              </p>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={d.isAnalystDept}
                  onChange={() => toggleFlag(d, "isAnalystDept")}
                />
                <span>
                  Analyst department
                  <span className="block text-xs text-muted-foreground">
                    Members see every department&apos;s leads, tasks, meetings, projects and accounts (read-only).
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={d.hasClientsModule}
                  onChange={() => toggleFlag(d, "hasClientsModule")}
                />
                <span>
                  Accounts module
                  <span className="block text-xs text-muted-foreground">
                    Members get the lightweight Accounts (clients) module in their sidebar.
                  </span>
                </span>
              </label>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
