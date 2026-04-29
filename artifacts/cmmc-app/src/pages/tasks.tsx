import { useState } from "react";
import { useListTasks } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, RiskBadge } from "@/components/ui/badges";
import { Link } from "wouter";

export default function Tasks() {
  const { data: tasks, isLoading } = useListTasks();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Tasks</h1>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div>Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Due Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks?.map((task) => (
                  <TableRow key={task.id} className={task.status === 'overdue' ? 'bg-red-50 dark:bg-red-950' : ''}>
                    <TableCell className="font-medium">
                      <Link href={`/tasks/${task.id}`} className="text-primary hover:underline">
                        {task.title}
                      </Link>
                    </TableCell>
                    <TableCell><StatusBadge status={task.status} /></TableCell>
                    <TableCell><RiskBadge level={task.priority} /></TableCell>
                    <TableCell>{task.assigneeName}</TableCell>
                    <TableCell className={task.status === 'overdue' ? 'text-red-600 font-bold' : ''}>
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'N/A'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}