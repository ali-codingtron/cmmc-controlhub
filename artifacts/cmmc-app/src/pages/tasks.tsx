import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListTasks, getListTasksQueryKey } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, RiskBadge } from "@/components/ui/badges";
import { Link } from "wouter";
import { Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/context/OrgContext";
import { useIsAssessor } from "@/lib/auth";

export default function Tasks() {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAssessor = useIsAssessor();

  const { data: tasks, isLoading } = useListTasks();

  const [deleteTask, setDeleteTask] = useState<{ id: string; title: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = (tasks ?? []).filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (t.title ?? "").toLowerCase().includes(q) || (t.assigneeName ?? "").toLowerCase().includes(q);
  });

  async function handleDelete() {
    if (!deleteTask) return;
    setDeleteLoading(true);
    try {
      const token = localStorage.getItem("auth_token");
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      if (activeOrg?.id) headers["X-Organization-ID"] = activeOrg.id;
      const r = await fetch(`/api/tasks/${deleteTask.id}`, { method: "DELETE", headers });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast({ title: "Delete failed", description: d.error ?? "Could not delete task", variant: "destructive" });
        return;
      }
      toast({ title: "Task deleted" });
      qc.invalidateQueries({ queryKey: getListTasksQueryKey() });
      setDeleteTask(null);
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Tasks</h1>
        <Input
          placeholder="Search tasks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-12 animate-pulse bg-muted rounded" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Due Date</TableHead>
                  {!isAssessor && <TableHead className="w-16 text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAssessor ? 5 : 6} className="text-center py-10 text-muted-foreground">
                      No tasks found.
                    </TableCell>
                  </TableRow>
                ) : filtered.map((task) => (
                  <TableRow key={task.id} className={task.status === "overdue" ? "bg-red-50 dark:bg-red-950" : ""}>
                    <TableCell className="font-medium">
                      <Link href={`/tasks/${task.id}`} className="text-primary hover:underline">
                        {task.title}
                      </Link>
                    </TableCell>
                    <TableCell><StatusBadge status={task.status} /></TableCell>
                    <TableCell><RiskBadge level={task.priority} /></TableCell>
                    <TableCell>{task.assigneeName}</TableCell>
                    <TableCell className={task.status === "overdue" ? "text-red-600 font-bold" : ""}>
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
                    </TableCell>
                    {!isAssessor && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                          title="Delete task"
                          onClick={() => setDeleteTask({ id: task.id!, title: task.title ?? "" })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!deleteTask} onOpenChange={() => setDeleteTask(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Permanently delete <span className="font-semibold text-foreground">"{deleteTask?.title}"</span>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTask(null)} disabled={deleteLoading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting…</> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
