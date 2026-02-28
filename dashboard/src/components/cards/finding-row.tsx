"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Ticket } from "lucide-react";
import { cn, getSeverityBg, truncate } from "@/lib/utils";
import type { Finding } from "@/types/api";

interface FindingRowProps {
  finding: Finding;
  onCreateJira?: (findingId: string) => void;
}

export function FindingRow({ finding, onCreateJira }: FindingRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-white/[0.04] last:border-0">
      {/* Collapsed row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
        )}

        <span className={cn("badge flex-shrink-0", getSeverityBg(finding.severity))}>
          {finding.severity.toUpperCase()}
        </span>

        <span className="text-sm text-gray-200 truncate flex-1">{finding.title}</span>

        <span className="text-xs text-gray-500 flex-shrink-0">{finding.category}</span>

        {finding.jiraTicketId && (
          <span className="text-xs text-brand-400 flex-shrink-0">{finding.jiraTicketId}</span>
        )}

        {finding.autoFixable && (
          <span className="badge bg-cyan-500/15 text-cyan-400 border-cyan-500/30 flex-shrink-0">
            Auto-fix
          </span>
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-12 pb-4 space-y-3 animate-fade-up">
          <p className="text-sm text-gray-300">{finding.description}</p>

          {finding.evidence && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">Evidence</div>
              <pre className="text-xs text-gray-400 bg-surface-1 p-3 rounded-lg overflow-x-auto font-mono">
                {finding.evidence}
              </pre>
            </div>
          )}

          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">Remediation</div>
            <p className="text-sm text-gray-300">{finding.remediation}</p>
          </div>

          {finding.location && (
            <div className="flex items-center gap-4 text-xs text-gray-500">
              {finding.location.file && <span>File: {truncate(finding.location.file, 60)}</span>}
              {finding.location.line && <span>Line: {finding.location.line}</span>}
              {finding.location.url && <span>URL: {truncate(finding.location.url, 60)}</span>}
              {finding.location.endpoint && <span>Endpoint: {finding.location.endpoint}</span>}
            </div>
          )}

          {(finding.cweId || finding.cvssScore) && (
            <div className="flex items-center gap-4 text-xs">
              {finding.cweId && <span className="text-gray-400">{finding.cweId}</span>}
              {finding.cvssScore && (
                <span className={cn(
                  "font-medium",
                  finding.cvssScore >= 9 ? "text-red-400" : finding.cvssScore >= 7 ? "text-orange-400" : "text-amber-400",
                )}>
                  CVSS: {finding.cvssScore}
                </span>
              )}
            </div>
          )}

          {finding.references.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {finding.references.map((ref, i) => (
                <a
                  key={i}
                  href={ref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300"
                >
                  <ExternalLink className="w-3 h-3" /> Reference {i + 1}
                </a>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/[0.04]">
            {!finding.jiraTicketId && onCreateJira && (
              <button
                onClick={() => onCreateJira(finding.id)}
                className="btn-secondary text-xs py-1.5"
              >
                <Ticket className="w-3.5 h-3.5" />
                Create Jira Ticket
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
