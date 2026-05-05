import { useGetTask, useCompleteTask, useReopenTask } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge, RiskBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { CheckCircle, RefreshCw } from "lucide-react";
import { useIsAssessor } from "@/lib/auth";

export default function TaskDetail({ id }: { id: string }) {
  const { data: task, isLoading, refetch } = useGetTask(id);
  const completeMutation = useCompleteTask();
  const reopenMutation = useReopenTask();
  const isAssessor = useIsAssessor();

  if (isLoading) return <div>Loading...</div>;
  if (!task) return <div>Task not found</div>;

  const handleComplete = async () => {
    await completeMutation.mutateAsync({ id, data: { completionNotes: "Completed via UI" } });
    refetch();
  };

  const handleReopen = async () => {
    await reopenMutation.mutateAsync({ id });
    refetch();
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{task.title}</h1>
            <StatusBadge status={task.status} />
            <RiskBadge level={task.priority} />
          </div>
        </div>
        <div className="flex gap-2">
          {!isAssessor && task.status !== 'completed' && (
            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleComplete}>
              <CheckCircle className="mr-2 h-4 w-4" /> Mark Complete
            </Button>
          )}
          {!isAssessor && task.status === 'completed' && (
            <Button variant="outline" onClick={handleReopen}>
              <RefreshCw className="mr-2 h-4 w-4" /> Reopen Task
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Task Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold mb-1">Description</h3>
            <p className="text-muted-foreground">{task.description || "No description provided."}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div>
              <span className="font-semibold block text-sm">Assignee</span>
              <span>{task.assigneeName}</span>
            </div>
            <div>
              <span className="font-semibold block text-sm">Due Date</span>
              <span className={task.status === 'overdue' ? 'text-red-600 font-bold' : ''}>
                {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date'}
              </span>
            </div>
            <div>
              <span className="font-semibold block text-sm">Task Type</span>
              <span className="capitalize">{task.taskType.replace(/_/g, ' ')}</span>
            </div>
            <div>
              <span className="font-semibold block text-sm">Linked Controls</span>
              <span>{task.linkedControlIds?.length ? task.linkedControlIds.join(", ") : "None"}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}