import { useState } from "react";
import { useListEvidence } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badges";
import { Link } from "wouter";
import { Plus } from "lucide-react";

export default function Evidence() {
  const [search, setSearch] = useState("");
  const { data: evidence, isLoading } = useListEvidence({ search });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Evidence Repository</h1>
        <Button asChild>
          <Link href="/evidence/upload">
            <Plus className="mr-2 h-4 w-4" /> Upload Evidence
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex gap-4">
            <Input 
              placeholder="Search evidence..." 
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
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Linked Controls</TableHead>
                  <TableHead>Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evidence?.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      <Link href={`/evidence/${item.id}`} className="text-primary hover:underline">
                        {item.title}
                      </Link>
                    </TableCell>
                    <TableCell>{item.evidenceType}</TableCell>
                    <TableCell><StatusBadge status={item.status} /></TableCell>
                    <TableCell>{item.ownerName}</TableCell>
                    <TableCell>{item.linkedControlLabels?.join(", ")}</TableCell>
                    <TableCell>{item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : 'N/A'}</TableCell>
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