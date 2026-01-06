'use client';

import { useCallback, useRef, useState } from "react";

function safeJsonParse(maybeJsonString) {
  if (typeof maybeJsonString !== "string") return maybeJsonString;
  try {
    return JSON.parse(maybeJsonString);
  } catch {
    return maybeJsonString;
  }
}

/**
 * Convert various table data formats to a standard { title, headers, rows } structure.
 * Handles multiple possible formats from different API responses.
 */
function parseTableData(payload, fallbackTitle = null) {
  // Format 1: Direct headers/rows in payload
  if (payload?.headers && Array.isArray(payload.headers)) {
    return {
      title: payload.title ?? fallbackTitle,
      headers: payload.headers,
      rows: payload.rows ?? payload.data ?? [],
    };
  }

  // Format 2: Snowflake result_set format with resultSetMetaData
  if (payload?.result_set) {
    const rs = payload.result_set;
    const meta = rs?.resultSetMetaData;
    
    // Check for rowType array (Snowflake format)
    if (meta?.rowType && Array.isArray(meta.rowType)) {
      return {
        title: payload.title ?? rs.title ?? fallbackTitle,
        headers: meta.rowType.map((c) => c.name || c),
        rows: rs.data ?? [],
      };
    }
    
    // Check for direct headers in result_set
    if (rs?.headers && Array.isArray(rs.headers)) {
      return {
        title: payload.title ?? rs.title ?? fallbackTitle,
        headers: rs.headers,
        rows: rs.rows ?? rs.data ?? [],
      };
    }
    
    // Check for columns array format
    if (rs?.columns && Array.isArray(rs.columns)) {
      return {
        title: payload.title ?? rs.title ?? fallbackTitle,
        headers: rs.columns.map(c => typeof c === 'string' ? c : c.name || c.label || c),
        rows: rs.rows ?? rs.data ?? [],
      };
    }
  }

  // Format 3: table property contains the data
  if (payload?.table) {
    const tbl = payload.table;
    
    // Nested result_set inside table
    if (tbl?.result_set) {
      return parseTableData({ result_set: tbl.result_set, title: tbl.title ?? fallbackTitle });
    }
    
    // Direct headers/rows in table
    if (tbl?.headers && Array.isArray(tbl.headers)) {
      return {
        title: tbl.title ?? fallbackTitle,
        headers: tbl.headers,
        rows: tbl.rows ?? tbl.data ?? [],
      };
    }
    
    // Columns format
    if (tbl?.columns && Array.isArray(tbl.columns)) {
      return {
        title: tbl.title ?? fallbackTitle,
        headers: tbl.columns.map(c => typeof c === 'string' ? c : c.name || c.label || c),
        rows: tbl.rows ?? tbl.data ?? [],
      };
    }
  }

  // Format 4: data array with column metadata
  if (payload?.columns && Array.isArray(payload.columns)) {
    return {
      title: payload.title ?? fallbackTitle,
      headers: payload.columns.map(c => typeof c === 'string' ? c : c.name || c.label || c),
      rows: payload.rows ?? payload.data ?? [],
    };
  }

  // Format 5: Simple data array (first row as headers)
  if (payload?.data && Array.isArray(payload.data) && payload.data.length > 0) {
    // If no explicit headers, check if first row could be headers
    if (!payload.headers && Array.isArray(payload.data[0])) {
      return {
        title: payload.title ?? fallbackTitle,
        headers: payload.data[0].map(String),
        rows: payload.data.slice(1),
      };
    }
    return {
      title: payload.title ?? fallbackTitle,
      headers: payload.headers ?? [],
      rows: payload.data,
    };
  }

  // Fallback: return empty table structure
  console.warn('[useCortexSSE] Could not parse table data from payload:', payload);
  return { title: fallbackTitle, headers: [], rows: [] };
}

/**
 * Convert various chart data formats to a standard chart spec.
 */
function parseChartData(payload) {
  // Format 1: Direct chartSpec property (most common in final response)
  if (payload?.chartSpec) {
    return safeJsonParse(payload.chartSpec);
  }

  // Format 2: Direct chart_spec string or object
  if (payload?.chart_spec) {
    return safeJsonParse(payload.chart_spec);
  }

  // Format 3: chart property contains the spec
  if (payload?.chart) {
    const chart = payload.chart;
    if (chart?.chart_spec) {
      return safeJsonParse(chart.chart_spec);
    }
    // chart itself might be the spec
    if (chart?.type || chart?.data || chart?.labels || chart?.datasets || chart?.mark || chart?.encoding) {
      return chart;
    }
  }

  // Format 4: spec property
  if (payload?.spec) {
    return safeJsonParse(payload.spec);
  }

  // Format 5: payload itself is the chart spec (Chart.js or Vega-Lite)
  if (payload?.type || payload?.data || payload?.labels || payload?.datasets || payload?.mark || payload?.encoding) {
    return payload;
  }

  console.warn('[useCortexSSE] Could not parse chart data from payload:', payload);
  return null;
}

// Legacy function for backward compatibility
function resultSetToTable(result_set, title = null) {
  return parseTableData({ result_set, title });
}

/**
 * Build finalAnswer from Snowflake `response` event:
 * {
 *   role: "assistant",
 *   content: [{ type:"text", text:"..." }, { type:"table", table:{...}}, { type:"chart", chart:{...}}]
 * }
 */
function buildFinalFromResponse(resp) {
  const content = resp?.content ?? [];
  const textParts = [];
  let table = null;
  let chartSpec = null;

  // Helper to validate table data
  const isValidTable = (parsed) => {
    return parsed && Array.isArray(parsed.headers) && parsed.headers.length > 0;
  };

  // Helper to validate chart data (supports both Chart.js and Vega-Lite formats)
  const isValidChart = (parsed) => {
    if (!parsed) return false;
    
    // Check Chart.js format
    if (
      (parsed.labels && Array.isArray(parsed.labels) && parsed.labels.length > 0) ||
      (parsed.datasets && Array.isArray(parsed.datasets) && parsed.datasets.length > 0) ||
      (parsed.data?.labels && Array.isArray(parsed.data.labels) && parsed.data.labels.length > 0) ||
      (parsed.data?.datasets && Array.isArray(parsed.data.datasets) && parsed.data.datasets.length > 0)
    ) {
      return true;
    }
    
    // Check Vega-Lite format (has mark, encoding, and data properties)
    if (parsed.mark && parsed.encoding && parsed.data) {
      return true;
    }
    
    return false;
  };

  for (const item of content) {
    if (item?.type === "text") {
      if (item.text) textParts.push(item.text);
    } else if (item?.type === "table") {
      // Use flexible table parser - handle various formats
      const parsed = parseTableData(item.table || item, item.table?.title ?? item.title ?? null);
      if (isValidTable(parsed)) {
        table = parsed;
      }
    } else if (item?.type === "chart") {
      // Use flexible chart parser - handle various formats
      const parsed = parseChartData(item.chart || item);
      if (isValidChart(parsed)) {
        chartSpec = parsed;
      }
    }
  }

  // Also check for table/chart at top level of response
  if (!table && (resp?.table || resp?.result_set)) {
    const parsed = parseTableData(resp.table || resp, resp.title ?? null);
    if (isValidTable(parsed)) {
      table = parsed;
    }
  }

  // Check for chartSpec at top level of response (most common format)
  if (!chartSpec && resp?.chartSpec) {
    const parsed = parseChartData(resp);
    if (isValidChart(parsed)) {
      chartSpec = parsed;
    }
  }

  // Check for chart or chart_spec at top level
  if (!chartSpec && (resp?.chart || resp?.chart_spec)) {
    const parsed = parseChartData(resp.chart || resp);
    if (isValidChart(parsed)) {
      chartSpec = parsed;
    }
  }

  // Also check nested raw.content structure if chartSpec is still null
  // This handles cases where the response structure has content nested in raw
  if (!chartSpec && resp?.raw?.content && Array.isArray(resp.raw.content)) {
    for (const item of resp.raw.content) {
      if (item?.type === 'chart') {
        const parsed = parseChartData(item.chart || item);
        if (isValidChart(parsed)) {
          chartSpec = parsed;
          break;
        }
      }
    }
  }

  console.log('[useCortexSSE] buildFinalFromResponse result:', { 
    textLength: textParts.length, 
    hasValidTable: !!table,
    tableHeaders: table?.headers?.length || 0,
    hasValidChart: !!chartSpec,
    chartKeys: chartSpec ? Object.keys(chartSpec) : null,
    hasRawContent: !!(resp?.raw?.content && Array.isArray(resp.raw.content))
  });

  return {
    text: textParts.filter(Boolean).join("\n\n").trim(),
    table: table || null, // Explicitly set to null if invalid
    chartSpec: chartSpec || null, // Explicitly set to null if invalid
    raw: resp,
  };
}

export function useCortexSSE() {
  const [streamState, setStreamState] = useState("idle");
  const [agentStatus, setAgentStatus] = useState(null);
  const [toolTimeline, setToolTimeline] = useState([]);
  const [analysisText, setAnalysisText] = useState("");
  const [finalAnswer, setFinalAnswer] = useState(null);
  const [error, setError] = useState(null);
  const [messageIds, setMessageIds] = useState({ user: null, assistant: null });

  const abortControllerRef = useRef(null);

  // Aggregate by content_index (Snowflake sends multiple blocks)
  const textByIndexRef = useRef(new Map());        // idx -> { text, annotations, is_elicitation }
  const tablesByIndexRef = useRef(new Map());      // idx -> table
  const chartsByIndexRef = useRef(new Map());      // idx -> chartSpec

  const reset = () => {
    setStreamState("idle");
    setAgentStatus(null);
    setToolTimeline([]);
    setAnalysisText("");
    setFinalAnswer(null);
    setError(null);
    setMessageIds({ user: null, assistant: null });

    textByIndexRef.current = new Map();
    tablesByIndexRef.current = new Map();
    chartsByIndexRef.current = new Map();
  };

  const stop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStreamState("done");
  };

  // Helper to check if table has valid data
  const hasValidTableData = (table) => {
    if (!table) return false;
    const hasHeaders = Array.isArray(table.headers) && table.headers.length > 0;
    const hasRows = Array.isArray(table.rows) && table.rows.length > 0;
    // Table is valid if it has headers (rows can be empty during streaming)
    return hasHeaders;
  };

  // Helper to check if chart has valid data
  const hasValidChartData = (chart) => {
    if (!chart) return false;
    // Chart.js format: must have labels or datasets
    if (chart.labels && Array.isArray(chart.labels) && chart.labels.length > 0) return true;
    if (chart.datasets && Array.isArray(chart.datasets) && chart.datasets.length > 0) return true;
    // Chart.js with data property
    if (chart.data?.labels && Array.isArray(chart.data.labels) && chart.data.labels.length > 0) return true;
    if (chart.data?.datasets && Array.isArray(chart.data.datasets) && chart.data.datasets.length > 0) return true;
    return false;
  };

  const recomputeFinalAnswerFromBlocks = () => {
    const textBlocks = [...textByIndexRef.current.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, v]) => v?.text ?? "")
      .filter(Boolean);

    const text = textBlocks.join("\n\n").trim();

    // Pick first table/chart by content_index (or enhance to support multiple)
    const firstTableEntry = [...tablesByIndexRef.current.entries()].sort(([a],[b]) => a-b)[0];
    const firstChartEntry = [...chartsByIndexRef.current.entries()].sort(([a],[b]) => a-b)[0];
    
    // Only set table/chart if they have valid data
    const firstTable = firstTableEntry?.[1] && hasValidTableData(firstTableEntry[1]) ? firstTableEntry[1] : null;
    const firstChart = firstChartEntry?.[1] && hasValidChartData(firstChartEntry[1]) ? firstChartEntry[1] : null;

    console.log('[useCortexSSE] recomputeFinalAnswerFromBlocks:', {
      textLength: text.length,
      rawTableEntry: firstTableEntry ? { 
        headersCount: firstTableEntry[1]?.headers?.length || 0,
        rowsCount: firstTableEntry[1]?.rows?.length || 0 
      } : null,
      hasValidTable: !!firstTable,
      tableStructure: firstTable ? { 
        headersCount: firstTable.headers?.length || 0,
        rowsCount: firstTable.rows?.length || 0 
      } : null,
      rawChartEntry: firstChartEntry ? { keys: Object.keys(firstChartEntry[1] || {}) } : null,
      hasValidChart: !!firstChart,
      chartKeys: firstChart ? Object.keys(firstChart) : null
    });

    setFinalAnswer((prev) => ({
      ...(prev ?? {}),
      text,
      table: firstTable,
      chartSpec: firstChart,
    }));
  };

  const startStream = useCallback(async (requestBody) => {
    reset();
    setStreamState("streaming");

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(`/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let shouldStop = false;

      // Proper SSE parsing: events separated by a blank line
      const processEventBlock = (block) => {
        let eventName = "";
        const dataLines = [];

        const lines = block.split(/\r?\n/);
        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            // Keep exact payload (don’t trim JSON)
            dataLines.push(line.slice(5).trimStart());
          }
        }

        const dataStr = dataLines.join("\n");
        if (!dataStr) return;

        let payload = null;
        try {
          payload = JSON.parse(dataStr);
        } catch {
          // Some implementations can send plain text; ignore safely.
          return;
        }

        // --- Snowflake event handling ---
        if (eventName === "metadata") {
          const role = payload?.role ?? payload?.metadata?.role;
          const message_id = payload?.message_id ?? payload?.metadata?.message_id;
          if (role && message_id !== undefined) {
            setMessageIds((prev) => ({ ...prev, [role]: message_id }));
          }
          return;
        }

        if (eventName === "response.status") {
          setAgentStatus(payload);
          return;
        }

        if (eventName === "response.thinking.delta") {
          setAnalysisText((prev) => prev + (payload.text ?? ""));
          return;
        }

        if (eventName === "response.thinking") {
          const newText = payload.text ?? "";
          setAnalysisText((prev) => (prev.includes(newText) ? prev : (prev ? prev + "\n\n" + newText : newText)));
          return;
        }

        if (eventName === "response.text.delta") {
          const idx = payload.content_index ?? 0;
          const delta = payload.text ?? "";
          const prev = textByIndexRef.current.get(idx) ?? { text: "", annotations: [], is_elicitation: false };
          textByIndexRef.current.set(idx, {
            ...prev,
            text: (prev.text ?? "") + delta,
            is_elicitation: !!payload.is_elicitation,
          });
          recomputeFinalAnswerFromBlocks();
          return;
        }

        if (eventName === "response.text") {
          const idx = payload.content_index ?? 0;
          textByIndexRef.current.set(idx, {
            text: payload.text ?? "",
            annotations: payload.annotations ?? [],
            is_elicitation: !!payload.is_elicitation,
          });
          recomputeFinalAnswerFromBlocks();
          return;
        }

        if (eventName === "response.text.annotation") {
          const idx = payload.content_index ?? 0;
          const prev = textByIndexRef.current.get(idx) ?? { text: "", annotations: [], is_elicitation: false };
          const annIndex = payload.annotation_index ?? prev.annotations.length;
          const nextAnnotations = [...(prev.annotations ?? [])];
          nextAnnotations[annIndex] = payload.annotation;
          textByIndexRef.current.set(idx, { ...prev, annotations: nextAnnotations });
          // (Optional) use annotations for citations rendering
          return;
        }

        if (eventName === "response.table") {
          const idx = payload.content_index ?? 0;
          const table = parseTableData(payload, payload.title ?? null);
          
          // Validate table has actual data (headers required, rows can be empty during streaming)
          const hasValidData = Array.isArray(table.headers) && table.headers.length > 0;
          
          console.log('[useCortexSSE] Parsed table:', { 
            hasHeaders: table.headers?.length > 0, 
            hasRows: table.rows?.length > 0,
            headersCount: table.headers?.length || 0,
            rowsCount: table.rows?.length || 0,
            hasValidData,
            payload: JSON.stringify(payload).substring(0, 200)
          });
          
          // Only store if has valid data
          if (hasValidData) {
            tablesByIndexRef.current.set(idx, table);
            recomputeFinalAnswerFromBlocks();
          } else {
            console.warn('[useCortexSSE] Ignoring table with no valid data:', table);
          }
          return;
        }

        if (eventName === "response.chart") {
          const idx = payload.content_index ?? 0;
          const spec = parseChartData(payload);
          
          // Helper to validate chart data (supports both Chart.js and Vega-Lite formats)
          const isValidChart = (parsed) => {
            if (!parsed) return false;
            
            // Check Chart.js format
            if (
              (parsed.labels && Array.isArray(parsed.labels) && parsed.labels.length > 0) ||
              (parsed.datasets && Array.isArray(parsed.datasets) && parsed.datasets.length > 0) ||
              (parsed.data?.labels && Array.isArray(parsed.data.labels) && parsed.data.labels.length > 0) ||
              (parsed.data?.datasets && Array.isArray(parsed.data.datasets) && parsed.data.datasets.length > 0)
            ) {
              return true;
            }
            
            // Check Vega-Lite format (has mark, encoding, and data properties)
            if (parsed.mark && parsed.encoding && parsed.data) {
              return true;
            }
            
            return false;
          };
          
          const hasValidData = isValidChart(spec);
          
          console.log('[useCortexSSE] Parsed chart:', { 
            hasSpec: !!spec,
            specKeys: spec ? Object.keys(spec) : null,
            hasLabels: spec?.labels?.length > 0 || spec?.data?.labels?.length > 0,
            hasDatasets: spec?.datasets?.length > 0 || spec?.data?.datasets?.length > 0,
            hasVegaLite: !!(spec?.mark && spec?.encoding && spec?.data),
            hasValidData,
            payload: JSON.stringify(payload).substring(0, 200)
          });
          
          // Only store if has valid data
          if (hasValidData) {
            chartsByIndexRef.current.set(idx, spec);
            recomputeFinalAnswerFromBlocks();
          } else {
            console.warn('[useCortexSSE] Ignoring chart with no valid data:', spec);
          }
          return;
        }

        if (eventName === "response.tool_use") {
          setToolTimeline((prev) => {
            if (prev.find((t) => t.tool_use_id === payload.tool_use_id)) return prev;
            return [...prev, {
              tool_use_id: payload.tool_use_id,
              name: payload.name,
              type: payload.type,
              input: payload.input,
            }];
          });
          return;
        }

        if (eventName === "response.tool_result.status") {
          setToolTimeline((prev) =>
            prev.map((t) =>
              t.tool_use_id === payload.tool_use_id
                ? { ...t, status: `${payload.status} – ${payload.message}` }
                : t
            )
          );
          return;
        }

        if (eventName === "response.tool_result") {
          setToolTimeline((prev) =>
            prev.map((t) =>
              t.tool_use_id === payload.tool_use_id
                ? { ...t, status: payload.status, result: payload.content }
                : t
            )
          );
          return;
        }

        if (eventName === "error") {
          setError(payload?.message || "Unknown streaming error");
          setStreamState("error");
          shouldStop = true;
          return;
        }

        // ✅ MOST IMPORTANT: final aggregated response (last event)
        if (eventName === "response") {
          const built = buildFinalFromResponse(payload);
          setFinalAnswer((prev) => ({ ...(prev ?? {}), ...built }));
          setStreamState("done");
          shouldStop = true;
          return;
        }

        // Unknown events: ignore safely (Snowflake recommends this)
      };

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Flush any remaining event block (if stream ended without trailing blank line)
          if (buffer.trim()) {
            processEventBlock(buffer);
          }
          setStreamState((s) => (s === "error" ? s : "done"));
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Split by blank line boundary (SSE event delimiter)
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() || "";

        for (const block of parts) {
          if (!block.trim()) continue;
          processEventBlock(block);
          if (shouldStop) break;
        }

        if (shouldStop) break;
      }
    } catch (err) {
      if (err.name === "AbortError") {
        setStreamState("done");
      } else {
        setStreamState("error");
        setError(err.message || "Streaming connection error");
      }
    }
  }, []);

  return {
    streamState,
    agentStatus,
    toolTimeline,
    analysisText,
    finalAnswer,
    error,
    messageIds,
    startStream,
    stop,
    reset,
  };
}
