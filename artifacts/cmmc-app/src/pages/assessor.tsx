import { useState } from "react";
import { useListAssessorControls } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LevelBadge } from "@/components/ui/badges";
import { Link } from "wouter";

export default function Assessor() {
  const [search, setSearch] = useState("");
  const { data: controls, isLoading } = useListAssessorControls({ search });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Assessor View</h1>
      </div>
      <p className="text-muted-foreground">Read-only view of controls ready for assessment.</p>

      <Card>
        <CardHeader>
          <div className="flex gap-4">
            <Input 
              placeholder="Search controls..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div>Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Control ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {controls?.map((control) => (
                  <TableRow key={control.id}>
                    <TableCell className="font-medium">
                      <Link href={`/assessor/controls/${control.id}`} className="text-primary hover:underline">
                        {control.controlId}
                      </Link>
                    </TableCell>
                    <TableCell>{control.title}</TableCell>
                    <TableCell>{control.domainName}</TableCell>
                    <TableCell><LevelBadge level={control.level} /></TableCell>
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