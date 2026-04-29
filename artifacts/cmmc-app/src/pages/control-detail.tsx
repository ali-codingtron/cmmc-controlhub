import { useGetControl, useGetControlEvidence, useGetControlTasks, useGetControlPoams } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge, LevelBadge, RiskBadge } from "@/components/ui/badges";
import { Link } from "wouter";

export default function ControlDetail({ id }: { id: string }) {
  const { data: control, isLoading: isLoadingControl } = useGetControl(id);
  const { data: evidence } = useGetControlEvidence(id);
  const { data: tasks } = useGetControlTasks(id);
  const { data: poams } = useGetControlPoams(id);

  if (isLoadingControl) return <div>Loading...</div>;
  if (!control) return <div>Control not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{control.controlId}</h1>
            <LevelBadge level={control.level} />
            <StatusBadge status={control.status} />
          </div>
          <h2 className="text-xl text-muted-foreground">{control.title}</h2>
        </div>
      </div>

      <Tabs defaultValue="implementation" className="w-full">
        <TabsList>
          <TabsTrigger value="implementation">Implementation</TabsTrigger>
          <TabsTrigger value="evidence">Evidence ({evidence?.length || 0})</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({tasks?.length || 0})</TabsTrigger>
          <TabsTrigger value="poams">POA&Ms ({poams?.length || 0})</TabsTrigger>
        </TabsList>
        
        <TabsContent value="implementation" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Implementation Narrative</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose max-w-none dark:prose-invert">
                {control.implementationNarrative ? (
                  <div dangerouslySetInnerHTML={{ __html: control.implementationNarrative }} />
                ) : (
                  <p className="text-muted-foreground">No implementation narrative provided yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="evidence" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {evidence?.map(item => (
              <Card key={item.id}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">
                      <Link href={`/evidence/${item.id}`} className="hover:underline">
                        {item.title}
                      </Link>
                    </CardTitle>
                    <StatusBadge status={item.status} />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{item.evidenceType}</p>
                  <p className="text-sm mt-2">Owner: {item.ownerName}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="mt-6">
          {/* List tasks */}
        </TabsContent>

        <TabsContent value="poams" className="mt-6">
          {/* List POAMs */}
        </TabsContent>
      </Tabs>
    </div>
  );
}