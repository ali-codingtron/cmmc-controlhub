import { useState } from "react";
import { useListPoams } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, RiskBadge } from "@/components/ui/badges";
import { Link } from "wouter";

export default function Poams() {
  const { data: poams, isLoading } = useListPoams();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">POA&Ms</h1>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div>Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>POA&M Number</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Risk Level</TableHead>
                  <TableHead>Control</TableHead>
                  <TableHead>Scheduled Completion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {poams?.map((poam) => (
                  <TableRow key={poam.id}>
                    <TableCell className="font-medium">
                      <Link href={`/poams/${poam.id}`} className="text-primary hover:underline">
                        {poam.poamNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{poam.title}</TableCell>
                    <TableCell><StatusBadge status={poam.status} /></TableCell>
                    <TableCell><RiskBadge level={poam.riskLevel} /></TableCell>
                    <TableCell>
                      <Link href={`/controls/${poam.linkedControlId}`} className="hover:underline">
                        {poam.linkedControlLabel}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {poam.scheduledCompletionDate ? new Date(poam.scheduledCompletionDate).toLocaleDateString() : 'N/A'}
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