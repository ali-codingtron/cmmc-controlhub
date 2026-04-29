import { useState } from "react";
import { useListControls } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, LevelBadge } from "@/components/ui/badges";
import { Link } from "wouter";

export default function Controls() {
  const [search, setSearch] = useState("");
  const { data: controls, isLoading } = useListControls({ search });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Controls Library</h1>
      </div>

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
                  <TableHead>Status</TableHead>
                  <TableHead>Evidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {controls?.map((control) => (
                  <TableRow key={control.id}>
                    <TableCell className="font-medium">
                      <Link href={`/controls/${control.id}`} className="text-primary hover:underline">
                        {control.controlId}
                      </Link>
                    </TableCell>
                    <TableCell>{control.title}</TableCell>
                    <TableCell>{control.domainName}</TableCell>
                    <TableCell><LevelBadge level={control.level} /></TableCell>
                    <TableCell><StatusBadge status={control.status} /></TableCell>
                    <TableCell>{control.approvedEvidenceCount} / {control.evidenceCount}</TableCell>
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