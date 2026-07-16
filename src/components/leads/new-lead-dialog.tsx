"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dropdown } from "@/components/ui/dropdown";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { IconPlus } from "@/components/icons";
import {
  MEETING_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  type AssignableUser,
  type MeetingStatus,
  type Priority,
} from "@/components/leads/types";

interface Department {
  id: string;
  name: string;
}

export function NewLeadDialog({
  isAdmin,
  assignableUsers,
  departments,
  onCreated,
}: {
  isAdmin: boolean;
  assignableUsers: AssignableUser[];
  departments: Department[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [product, setProduct] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [leadArriveDate, setLeadArriveDate] = useState<Date | null>(null);
  const [meetingDate, setMeetingDate] = useState<Date | null>(null);
  const [meetingStatus, setMeetingStatus] = useState<MeetingStatus | "">("");
  const [assignedToId, setAssignedToId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function reset() {
    setName("");
    setCompany("");
    setEmail("");
    setPhone("");
    setSource("");
    setProduct("");
    setPriority("MEDIUM");
    setLeadArriveDate(null);
    setMeetingDate(null);
    setMeetingStatus("");
    setAssignedToId("");
    setDepartmentId("");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          company: company || null,
          email: email || null,
          phone: phone || null,
          source: source || null,
          product: product || null,
          priority,
          leadArriveDate: leadArriveDate ? leadArriveDate.toISOString() : null,
          meetingDate: meetingDate ? meetingDate.toISOString() : null,
          meetingStatus: meetingStatus || null,
          assignedToId: assignedToId || null,
          departmentId: departmentId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      reset();
      setOpen(false);
      onCreated();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <IconPlus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New lead</DialogTitle>
        </DialogHeader>
        <DialogBody>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lead-name">Name</Label>
            <Input id="lead-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lead-company">Company</Label>
              <Input id="lead-company" value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lead-source">Source</Label>
              <Input id="lead-source" value={source} onChange={(e) => setSource(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lead-email">Email</Label>
              <Input id="lead-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lead-phone">Phone</Label>
              <Input id="lead-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lead-product">Product</Label>
            <Input id="lead-product" value={product} onChange={(e) => setProduct(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lead-priority">Priority</Label>
              <Dropdown
                id="lead-priority"
                value={priority}
                onChange={(v) => setPriority(v as Priority)}
                options={PRIORITY_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lead-assignee">Assign to</Label>
              <Dropdown
                id="lead-assignee"
                value={assignedToId}
                onChange={setAssignedToId}
                placeholder="Unassigned"
                options={assignableUsers.map((u) => ({ value: u.id, label: u.name }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Lead arrive date</Label>
              <DateTimePicker value={leadArriveDate} onChange={setLeadArriveDate} placeholder="Not set" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Meeting date</Label>
              <DateTimePicker value={meetingDate} onChange={setMeetingDate} placeholder="Not set" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lead-meeting-status">Meeting status</Label>
            <Dropdown
              id="lead-meeting-status"
              value={meetingStatus}
              onChange={(v) => setMeetingStatus(v as MeetingStatus)}
              placeholder="Not set"
              options={MEETING_STATUS_OPTIONS.map((m) => ({ value: m.value, label: m.label }))}
            />
          </div>
          {isAdmin && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lead-department">Department</Label>
              <Dropdown
                id="lead-department"
                value={departmentId}
                onChange={setDepartmentId}
                placeholder="None"
                options={departments.map((d) => ({ value: d.id, label: d.name }))}
              />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="mt-1">
            Create lead
          </Button>
        </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
