'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, Time, CrosshairMode } from 'lightweight-charts';
import { v4 as uuidv4 } from 'uuid';
import {
  Drawing,
  DrawingType,
  TrendlineDrawing,
  HorizontalLineDrawing,
  RectangleDrawing,
  ArrowDrawing,
  TextDrawing,
  PriceMarkerDrawing,
  Point,
  CandleData,
} from '@/types';

interface BroadcastChartProps {
  symbol: string;
  referralCode: string;
  candles: CandleData[];
  currentPrice: number;
  onDrawingsChange: (drawings: Drawing[]) => void;
  initialDrawings?: Drawing[];
  readOnly?: boolean;
}

type DrawingMode = DrawingType | 'select' | null;

interface DrawingState {
  isDrawing: boolean;
  startPoint: Point | null;
  currentPoint: Point | null;
  startPixel: { x: number; y: number } | null;
  currentPixel: { x: number; y: number } | null;
  mode: DrawingMode;
}

const COLORS = [
  '#FF444F', // Red (primary)
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#f59e0b', // Amber
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#ffffff', // White
];

export default function BroadcastChart({
  symbol,
  referralCode,
  candles,
  currentPrice,
  onDrawingsChange,
  initialDrawings = [],
  readOnly = false,
}: BroadcastChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);

  const [drawings, setDrawings] = useState<Drawing[]>(initialDrawings);
  const [selectedDrawing, setSelectedDrawing] = useState<string | null>(null);
  const [drawingState, setDrawingState] = useState<DrawingState>({
    isDrawing: false,
    startPoint: null,
    currentPoint: null,
    startPixel: null,
    currentPixel: null,
    mode: null,
  });
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [lineWidth, setLineWidth] = useState(2);
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInputPosition, setTextInputPosition] = useState<{ x: number; y: number } | null>(null);
  const [pendingTextPoint, setPendingTextPoint] = useState<Point | null>(null);
  const [crosshairData, setCrosshairData] = useState<{ time: number; price: number } | null>(null);

  // Refs for animation and drawing state (to avoid stale closures)
  const animationFrameRef = useRef<number | null>(null);
  const currentPixelRef = useRef<{ x: number; y: number } | null>(null);
  const startPixelRef = useRef<{ x: number; y: number } | null>(null);
  const startPointRef = useRef<Point | null>(null);
  const isDrawingRef = useRef(false);

  // Check if we're in drawing mode
  const isDrawingMode = drawingState.mode !== null && drawingState.mode !== 'select';

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#06060a' },
        textColor: '#a1a1aa',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(255, 68, 79, 0.4)',
          width: 1,
          style: 2,
        },
        horzLine: {
          color: 'rgba(255, 68, 79, 0.4)',
          width: 1,
          style: 2,
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#FF444F',
      borderUpColor: '#22c55e',
      borderDownColor: '#FF444F',
      wickUpColor: '#22c55e',
      wickDownColor: '#FF444F',
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    // Subscribe to crosshair move for coordinate tracking
    chart.subscribeCrosshairMove((param) => {
      if (param.time && param.point) {
        const price = param.seriesData.get(candleSeries);
        if (price && typeof price === 'object' && 'close' in price) {
          setCrosshairData({
            time: param.time as number,
            price: (price as any).close,
          });
        }
      }
    });

    // Handle resize
    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
        resizeDrawingCanvas(true); // Force resize on window resize
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // Enable/disable chart interaction based on drawing mode
  useEffect(() => {
    if (!chartRef.current) return;

    chartRef.current.applyOptions({
      handleScroll: !isDrawingMode,
      handleScale: !isDrawingMode,
    });
  }, [isDrawingMode]);

  // Update candle data
  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;

    const formattedData: CandlestickData[] = candles.map((c) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    candleSeriesRef.current.setData(formattedData);
  }, [candles]);

  // Track last canvas size to avoid unnecessary resizes
  const lastCanvasSizeRef = useRef<{ width: number; height: number } | null>(null);
  const canvasInitializedRef = useRef(false);

  // Resize drawing canvas to match chart (only if size changed)
  const resizeDrawingCanvas = useCallback((force = false) => {
    if (!drawingCanvasRef.current || !containerRef.current) return false;
    const canvas = drawingCanvasRef.current;
    const rect = containerRef.current.getBoundingClientRect();

    // Check if size actually changed
    const newWidth = Math.floor(rect.width);
    const newHeight = Math.floor(rect.height);

    if (!force && lastCanvasSizeRef.current &&
        lastCanvasSizeRef.current.width === newWidth &&
        lastCanvasSizeRef.current.height === newHeight) {
      return false; // Size hasn't changed, don't resize
    }

    lastCanvasSizeRef.current = { width: newWidth, height: newHeight };

    // Set actual pixel dimensions (not CSS size)
    const dpr = window.devicePixelRatio || 1;
    canvas.width = newWidth * dpr;
    canvas.height = newHeight * dpr;

    // Scale canvas context to match
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }

    // Set CSS size to match container
    canvas.style.width = `${newWidth}px`;
    canvas.style.height = `${newHeight}px`;

    return true; // Size was changed
  }, []);

  // Initialize canvas once when chart is ready
  useEffect(() => {
    if (!canvasInitializedRef.current && candles.length > 0 && chartRef.current) {
      canvasInitializedRef.current = true;
      setTimeout(() => {
        resizeDrawingCanvas(true); // Force initial resize
      }, 100);
    }
  }, [candles.length, resizeDrawingCanvas]);

  // Get chart coordinates from pixel position
  const getChartCoordsFromPixel = useCallback((pixelX: number, pixelY: number): Point | null => {
    if (!chartRef.current || !candleSeriesRef.current || candles.length === 0) return null;

    const timeScale = chartRef.current.timeScale();
    const time = timeScale.coordinateToTime(pixelX);
    const price = candleSeriesRef.current.coordinateToPrice(pixelY);

    if (time === null || price === null) {
      // Fallback: estimate time and price from visible range and candles
      const visibleRange = timeScale.getVisibleRange();

      if (!visibleRange || candles.length === 0) return null;

      const canvas = drawingCanvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return null;

      // Get container dimensions (not canvas which is scaled by DPR)
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;

      // Estimate chart area (excluding scales)
      const chartWidth = containerWidth - 60; // Approximate price scale width
      const chartHeight = containerHeight - 30; // Approximate time scale height

      // Estimate time from visible range
      const timeRange = (visibleRange.to as number) - (visibleRange.from as number);
      const estimatedTime = (visibleRange.from as number) + (pixelX / chartWidth) * timeRange;

      // Estimate price from candles in visible range
      const visibleCandles = candles.filter(
        (c) => c.time >= (visibleRange.from as number) && c.time <= (visibleRange.to as number)
      );

      if (visibleCandles.length === 0) {
        // Use current price as fallback
        return { x: estimatedTime, y: currentPrice };
      }

      const minPrice = Math.min(...visibleCandles.map((c) => c.low));
      const maxPrice = Math.max(...visibleCandles.map((c) => c.high));
      const priceRangeVal = maxPrice - minPrice || 1;
      const padding = priceRangeVal * 0.1;

      const estimatedPrice = maxPrice + padding - ((pixelY / chartHeight) * (priceRangeVal + 2 * padding));

      return { x: estimatedTime, y: estimatedPrice };
    }

    return { x: time as number, y: price };
  }, [candles, currentPrice]);

  // Convert chart coordinates to pixel coordinates
  const chartToPixelCoords = useCallback((point: Point): { x: number; y: number } | null => {
    if (!chartRef.current || !candleSeriesRef.current || !containerRef.current) return null;

    const timeScale = chartRef.current.timeScale();
    const x = timeScale.timeToCoordinate(point.x as Time);
    const y = candleSeriesRef.current.priceToCoordinate(point.y);

    if (x !== null && y !== null) {
      return { x, y };
    }

    // Fallback: estimate pixel position from visible range
    const visibleRange = timeScale.getVisibleRange();
    if (!visibleRange || candles.length === 0) return null;

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    // Estimate chart area (excluding scales)
    const chartWidth = containerWidth - 60; // Approximate price scale width
    const chartHeight = containerHeight - 30; // Approximate time scale height

    // Calculate X from time
    const timeRange = (visibleRange.to as number) - (visibleRange.from as number);
    const estimatedX = ((point.x - (visibleRange.from as number)) / timeRange) * chartWidth;

    // Calculate Y from price using visible candles
    const visibleCandles = candles.filter(
      (c) => c.time >= (visibleRange.from as number) && c.time <= (visibleRange.to as number)
    );

    if (visibleCandles.length === 0) return null;

    const minPrice = Math.min(...visibleCandles.map((c) => c.low));
    const maxPrice = Math.max(...visibleCandles.map((c) => c.high));
    const priceRangeVal = maxPrice - minPrice || 1;
    const padding = priceRangeVal * 0.1;

    const estimatedY = ((maxPrice + padding - point.y) / (priceRangeVal + 2 * padding)) * chartHeight;

    return { x: estimatedX, y: estimatedY };
  }, [candles]);

  // Render all drawings on canvas
  const renderDrawings = useCallback(() => {
    if (!drawingCanvasRef.current || !containerRef.current) return;
    const canvas = drawingCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = containerRef.current.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Render each drawing
    drawings.forEach((drawing) => {
      const isSelected = selectedDrawing === drawing.id;

      switch (drawing.type) {
        case 'trendline':
          renderTrendline(ctx, drawing as TrendlineDrawing, isSelected);
          break;
        case 'horizontal':
          renderHorizontalLine(ctx, drawing as HorizontalLineDrawing, isSelected);
          break;
        case 'rectangle':
          renderRectangle(ctx, drawing as RectangleDrawing, isSelected);
          break;
        case 'arrow':
          renderArrow(ctx, drawing as ArrowDrawing, isSelected);
          break;
        case 'text':
          renderText(ctx, drawing as TextDrawing, isSelected);
          break;
        case 'pricemarker':
          renderPriceMarker(ctx, drawing as PriceMarkerDrawing, isSelected);
          break;
      }
    });

    // Render current drawing in progress using pixel coordinates (prefer refs for latest values)
    const startPx = startPixelRef.current || drawingState.startPixel;
    const currentPx = currentPixelRef.current || drawingState.currentPixel;

    if ((drawingState.isDrawing || isDrawingRef.current) && startPx && currentPx) {
      // Inline rendering for in-progress drawing to avoid circular dependency
      ctx.save();
      ctx.strokeStyle = selectedColor;
      ctx.fillStyle = selectedColor;
      ctx.lineWidth = lineWidth;

      switch (drawingState.mode) {
        case 'trendline':
          ctx.beginPath();
          ctx.moveTo(startPx.x, startPx.y);
          ctx.lineTo(currentPx.x, currentPx.y);
          ctx.stroke();
          break;

        case 'rectangle':
          const rx = Math.min(startPx.x, currentPx.x);
          const ry = Math.min(startPx.y, currentPx.y);
          const rw = Math.abs(currentPx.x - startPx.x);
          const rh = Math.abs(currentPx.y - startPx.y);
          ctx.globalAlpha = 0.2;
          ctx.fillRect(rx, ry, rw, rh);
          ctx.globalAlpha = 1;
          ctx.strokeRect(rx, ry, rw, rh);
          break;

        case 'arrow':
          const headSize = 15;
          const angle = Math.atan2(currentPx.y - startPx.y, currentPx.x - startPx.x);
          ctx.beginPath();
          ctx.moveTo(startPx.x, startPx.y);
          ctx.lineTo(currentPx.x, currentPx.y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(currentPx.x, currentPx.y);
          ctx.lineTo(
            currentPx.x - headSize * Math.cos(angle - Math.PI / 6),
            currentPx.y - headSize * Math.sin(angle - Math.PI / 6)
          );
          ctx.lineTo(
            currentPx.x - headSize * Math.cos(angle + Math.PI / 6),
            currentPx.y - headSize * Math.sin(angle + Math.PI / 6)
          );
          ctx.closePath();
          ctx.fill();
          break;

        case 'horizontal':
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(0, currentPx.y);
          ctx.lineTo(containerRef.current?.clientWidth || 800, currentPx.y);
          ctx.stroke();
          ctx.setLineDash([]);
          break;
      }

      ctx.restore();
    }
  }, [drawings, selectedDrawing, drawingState, chartToPixelCoords, selectedColor, lineWidth]);

  // Render trendline
  const renderTrendline = (ctx: CanvasRenderingContext2D, drawing: TrendlineDrawing, isSelected: boolean) => {
    const start = chartToPixelCoords(drawing.startPoint);
    const end = chartToPixelCoords(drawing.endPoint);
    if (!start || !end) return;

    ctx.beginPath();
    ctx.strokeStyle = drawing.color;
    ctx.lineWidth = isSelected ? drawing.lineWidth + 2 : drawing.lineWidth;

    if (isSelected) {
      ctx.shadowColor = drawing.color;
      ctx.shadowBlur = 10;
    }

    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw selection handles
    if (isSelected) {
      drawHandle(ctx, start.x, start.y, drawing.color);
      drawHandle(ctx, end.x, end.y, drawing.color);
    }
  };

  // Render horizontal line
  const renderHorizontalLine = (ctx: CanvasRenderingContext2D, drawing: HorizontalLineDrawing, isSelected: boolean) => {
    if (!candleSeriesRef.current || !drawingCanvasRef.current) return;

    const y = candleSeriesRef.current.priceToCoordinate(drawing.price);
    if (y === null) return;

    ctx.beginPath();
    ctx.strokeStyle = drawing.color;
    ctx.lineWidth = isSelected ? drawing.lineWidth + 1 : drawing.lineWidth;
    ctx.setLineDash([5, 5]);

    if (isSelected) {
      ctx.shadowColor = drawing.color;
      ctx.shadowBlur = 8;
    }

    ctx.moveTo(0, y);
    ctx.lineTo(drawingCanvasRef.current.width, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // Draw label
    if (drawing.label) {
      ctx.fillStyle = drawing.color;
      ctx.font = '12px Inter, sans-serif';
      ctx.fillText(drawing.label, 10, y - 5);
    }

    // Draw price label on right
    ctx.fillStyle = drawing.color;
    ctx.fillRect(drawingCanvasRef.current.width - 70, y - 10, 70, 20);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(drawing.price.toFixed(2), drawingCanvasRef.current.width - 35, y + 4);
    ctx.textAlign = 'left';
  };

  // Render rectangle
  const renderRectangle = (ctx: CanvasRenderingContext2D, drawing: RectangleDrawing, isSelected: boolean) => {
    const start = chartToPixelCoords(drawing.startPoint);
    const end = chartToPixelCoords(drawing.endPoint);
    if (!start || !end) return;

    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    // Fill
    ctx.fillStyle = drawing.fillColor;
    ctx.globalAlpha = drawing.fillOpacity;
    ctx.fillRect(x, y, width, height);
    ctx.globalAlpha = 1;

    // Border
    ctx.strokeStyle = drawing.color;
    ctx.lineWidth = isSelected ? drawing.lineWidth + 1 : drawing.lineWidth;

    if (isSelected) {
      ctx.shadowColor = drawing.color;
      ctx.shadowBlur = 8;
    }

    ctx.strokeRect(x, y, width, height);
    ctx.shadowBlur = 0;

    // Selection handles
    if (isSelected) {
      drawHandle(ctx, start.x, start.y, drawing.color);
      drawHandle(ctx, end.x, end.y, drawing.color);
      drawHandle(ctx, start.x, end.y, drawing.color);
      drawHandle(ctx, end.x, start.y, drawing.color);
    }
  };

  // Render arrow
  const renderArrow = (ctx: CanvasRenderingContext2D, drawing: ArrowDrawing, isSelected: boolean) => {
    const start = chartToPixelCoords(drawing.startPoint);
    const end = chartToPixelCoords(drawing.endPoint);
    if (!start || !end) return;

    const headSize = drawing.headSize || 15;
    const angle = Math.atan2(end.y - start.y, end.x - start.x);

    ctx.beginPath();
    ctx.strokeStyle = drawing.color;
    ctx.fillStyle = drawing.color;
    ctx.lineWidth = isSelected ? drawing.lineWidth + 1 : drawing.lineWidth;

    if (isSelected) {
      ctx.shadowColor = drawing.color;
      ctx.shadowBlur = 8;
    }

    // Line
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    // Arrow head
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(
      end.x - headSize * Math.cos(angle - Math.PI / 6),
      end.y - headSize * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      end.x - headSize * Math.cos(angle + Math.PI / 6),
      end.y - headSize * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    if (isSelected) {
      drawHandle(ctx, start.x, start.y, drawing.color);
    }
  };

  // Render text
  const renderText = (ctx: CanvasRenderingContext2D, drawing: TextDrawing, isSelected: boolean) => {
    const pos = chartToPixelCoords(drawing.position);
    if (!pos) return;

    ctx.font = `${drawing.fontSize}px Inter, sans-serif`;
    const metrics = ctx.measureText(drawing.text);
    const padding = 6;

    // Background
    if (drawing.backgroundColor) {
      ctx.fillStyle = drawing.backgroundColor;
      ctx.globalAlpha = 0.8;
      ctx.fillRect(
        pos.x - padding,
        pos.y - drawing.fontSize - padding,
        metrics.width + padding * 2,
        drawing.fontSize + padding * 2
      );
      ctx.globalAlpha = 1;
    }

    // Text
    ctx.fillStyle = drawing.color;
    if (isSelected) {
      ctx.shadowColor = drawing.color;
      ctx.shadowBlur = 5;
    }
    ctx.fillText(drawing.text, pos.x, pos.y);
    ctx.shadowBlur = 0;

    // Selection border
    if (isSelected) {
      ctx.strokeStyle = drawing.color;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(
        pos.x - padding,
        pos.y - drawing.fontSize - padding,
        metrics.width + padding * 2,
        drawing.fontSize + padding * 2
      );
      ctx.setLineDash([]);
    }
  };

  // Render price marker
  const renderPriceMarker = (ctx: CanvasRenderingContext2D, drawing: PriceMarkerDrawing, isSelected: boolean) => {
    if (!candleSeriesRef.current || !drawingCanvasRef.current) return;

    const y = candleSeriesRef.current.priceToCoordinate(drawing.price);
    if (y === null) return;

    const isBuy = drawing.side === 'buy';
    const bgColor = isBuy ? '#22c55e' : '#FF444F';
    const width = 120;
    const height = 28;
    const x = 10;

    // Background with glow
    if (isSelected) {
      ctx.shadowColor = bgColor;
      ctx.shadowBlur = 15;
    }

    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(x, y - height / 2, width, height, 6);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Arrow indicator
    ctx.beginPath();
    ctx.moveTo(x + width, y);
    ctx.lineTo(x + width + 10, y - 6);
    ctx.lineTo(x + width + 10, y + 6);
    ctx.closePath();
    ctx.fill();

    // Icon
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.fillText(isBuy ? '▲' : '▼', x + 10, y + 5);

    // Label
    ctx.font = '12px Inter, sans-serif';
    ctx.fillText(drawing.label || (isBuy ? 'BUY' : 'SELL'), x + 30, y + 4);

    // Price on right side
    ctx.fillStyle = bgColor;
    ctx.fillRect(drawingCanvasRef.current.width - 70, y - 10, 70, 20);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(drawing.price.toFixed(2), drawingCanvasRef.current.width - 35, y + 4);
    ctx.textAlign = 'left';

    // Dashed line across
    ctx.strokeStyle = bgColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x + width + 15, y);
    ctx.lineTo(drawingCanvasRef.current.width - 75, y);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  // Draw selection handle
  const drawHandle = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string) => {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };

  // Re-render drawings when they change or chart moves
  useEffect(() => {
    renderDrawings();
  }, [drawings, drawingState, selectedDrawing, renderDrawings]);

  // Animation loop for smooth drawing
  useEffect(() => {
    const animate = () => {
      if (isDrawingRef.current && drawingState.startPixel && currentPixelRef.current) {
        renderDrawings();
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [renderDrawings, drawingState.startPixel]);

  // Subscribe to chart changes to re-render drawings
  useEffect(() => {
    if (!chartRef.current) return;

    const chart = chartRef.current;

    const handleVisibleRangeChange = () => {
      renderDrawings();
    };

    chart.timeScale().subscribeVisibleTimeRangeChange(handleVisibleRangeChange);

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handleVisibleRangeChange);
    };
  }, [renderDrawings]);

  // Handle canvas mouse events
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (readOnly || !isDrawingMode) return;

    e.preventDefault();
    e.stopPropagation();

    const canvas = drawingCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const pixelX = e.clientX - rect.left;
    const pixelY = e.clientY - rect.top;

    const chartPoint = getChartCoordsFromPixel(pixelX, pixelY);

    if (drawingState.mode === 'horizontal') {
      // Horizontal line - use current price from click position
      const price = chartPoint?.y || currentPrice;
      const newDrawing: HorizontalLineDrawing = {
        id: uuidv4(),
        type: 'horizontal',
        referralCode,
        symbol,
        color: selectedColor,
        lineWidth,
        price: price,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const newDrawings = [...drawings, newDrawing];
      setDrawings(newDrawings);
      onDrawingsChange(newDrawings);
      return;
    }

    if (drawingState.mode === 'pricemarker') {
      // Price marker - use current price from click position
      const price = chartPoint?.y || currentPrice;
      const newDrawing: PriceMarkerDrawing = {
        id: uuidv4(),
        type: 'pricemarker',
        referralCode,
        symbol,
        color: selectedColor,
        lineWidth,
        price: price,
        label: 'Signal',
        side: selectedColor === '#22c55e' ? 'buy' : 'sell',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const newDrawings = [...drawings, newDrawing];
      setDrawings(newDrawings);
      onDrawingsChange(newDrawings);
      return;
    }

    if (drawingState.mode === 'text') {
      // Show text input
      if (chartPoint) {
        setPendingTextPoint(chartPoint);
      } else {
        // Fallback to using current price
        setPendingTextPoint({ x: Date.now() / 1000, y: currentPrice });
      }
      setTextInputPosition({ x: e.clientX, y: e.clientY });
      setShowTextInput(true);
      return;
    }

    // Start drawing for drag-based tools (trendline, rectangle, arrow)
    // Set refs synchronously for reliable access in handlers
    isDrawingRef.current = true;
    startPixelRef.current = { x: pixelX, y: pixelY };
    startPointRef.current = chartPoint;
    currentPixelRef.current = { x: pixelX, y: pixelY };

    setDrawingState({
      ...drawingState,
      isDrawing: true,
      startPoint: chartPoint,
      currentPoint: chartPoint,
      startPixel: { x: pixelX, y: pixelY },
      currentPixel: { x: pixelX, y: pixelY },
    });
  }, [drawingState.mode, selectedColor, lineWidth, drawings, readOnly, getChartCoordsFromPixel, referralCode, symbol, onDrawingsChange, isDrawingMode, currentPrice]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingState.isDrawing && !isDrawingRef.current) return;

    e.preventDefault();
    e.stopPropagation();

    const canvas = drawingCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const pixelX = e.clientX - rect.left;
    const pixelY = e.clientY - rect.top;

    // Update ref immediately for animation loop
    currentPixelRef.current = { x: pixelX, y: pixelY };

    const chartPoint = getChartCoordsFromPixel(pixelX, pixelY);

    setDrawingState((prev) => ({
      ...prev,
      currentPoint: chartPoint || prev.currentPoint,
      currentPixel: { x: pixelX, y: pixelY },
    }));
  }, [drawingState.isDrawing, getChartCoordsFromPixel]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // Check both state and ref since state updates are async
    if (!drawingState.isDrawing && !isDrawingRef.current) return;

    e.preventDefault();
    e.stopPropagation();

    const canvas = drawingCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const pixelX = e.clientX - rect.left;
    const pixelY = e.clientY - rect.top;

    const endChartPoint = getChartCoordsFromPixel(pixelX, pixelY);
    // Use ref for start point since state might be stale in closure
    const startChartPoint = startPointRef.current || drawingState.startPoint;

    // Need both points for these drawing types
    if (!startChartPoint || !endChartPoint) {
      // Reset refs
      isDrawingRef.current = false;
      startPixelRef.current = null;
      startPointRef.current = null;
      currentPixelRef.current = null;

      setDrawingState({
        ...drawingState,
        isDrawing: false,
        startPoint: null,
        currentPoint: null,
        startPixel: null,
        currentPixel: null,
      });
      return;
    }

    let newDrawing: Drawing | null = null;

    switch (drawingState.mode) {
      case 'trendline':
        newDrawing = {
          id: uuidv4(),
          type: 'trendline',
          referralCode,
          symbol,
          color: selectedColor,
          lineWidth,
          startPoint: startChartPoint,
          endPoint: endChartPoint,
          extendLeft: false,
          extendRight: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as TrendlineDrawing;
        break;

      case 'rectangle':
        newDrawing = {
          id: uuidv4(),
          type: 'rectangle',
          referralCode,
          symbol,
          color: selectedColor,
          lineWidth,
          startPoint: startChartPoint,
          endPoint: endChartPoint,
          fillColor: selectedColor,
          fillOpacity: 0.15,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as RectangleDrawing;
        break;

      case 'arrow':
        newDrawing = {
          id: uuidv4(),
          type: 'arrow',
          referralCode,
          symbol,
          color: selectedColor,
          lineWidth,
          startPoint: startChartPoint,
          endPoint: endChartPoint,
          headSize: 15,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as ArrowDrawing;
        break;
    }

    if (newDrawing) {
      const newDrawings = [...drawings, newDrawing];
      setDrawings(newDrawings);
      onDrawingsChange(newDrawings);
    }

    // Reset all refs
    isDrawingRef.current = false;
    startPixelRef.current = null;
    startPointRef.current = null;
    currentPixelRef.current = null;

    setDrawingState({
      ...drawingState,
      isDrawing: false,
      startPoint: null,
      currentPoint: null,
      startPixel: null,
      currentPixel: null,
    });
  }, [drawingState, selectedColor, lineWidth, drawings, referralCode, symbol, onDrawingsChange, getChartCoordsFromPixel]);

  // Handle text input submit
  const handleTextSubmit = () => {
    if (!pendingTextPoint || !textInput.trim()) {
      setShowTextInput(false);
      setPendingTextPoint(null);
      setTextInput('');
      return;
    }

    const newDrawing: TextDrawing = {
      id: uuidv4(),
      type: 'text',
      referralCode,
      symbol,
      color: selectedColor,
      lineWidth,
      position: pendingTextPoint,
      text: textInput,
      fontSize: 14,
      backgroundColor: '#1a1a28',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const newDrawings = [...drawings, newDrawing];
    setDrawings(newDrawings);
    onDrawingsChange(newDrawings);

    setShowTextInput(false);
    setPendingTextPoint(null);
    setTextInput('');
  };

  // Delete selected drawing
  const deleteSelectedDrawing = () => {
    if (!selectedDrawing) return;
    const newDrawings = drawings.filter((d) => d.id !== selectedDrawing);
    setDrawings(newDrawings);
    onDrawingsChange(newDrawings);
    setSelectedDrawing(null);
  };

  // Clear all drawings
  const clearAllDrawings = () => {
    setDrawings([]);
    onDrawingsChange([]);
    setSelectedDrawing(null);
  };

  // Select a drawing tool
  const selectTool = (mode: DrawingMode) => {
    setDrawingState({
      isDrawing: false,
      startPoint: null,
      currentPoint: null,
      startPixel: null,
      currentPixel: null,
      mode,
    });
  };

  // Tool button component
  const ToolButton = ({ mode, icon, label }: { mode: DrawingMode; icon: React.ReactNode; label: string }) => (
    <button
      onClick={() => selectTool(mode)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 12px',
        background: drawingState.mode === mode ? 'rgba(255, 68, 79, 0.2)' : 'rgba(255, 255, 255, 0.05)',
        border: `1px solid ${drawingState.mode === mode ? '#FF444F' : 'rgba(255, 255, 255, 0.1)'}`,
        borderRadius: 6,
        color: drawingState.mode === mode ? '#FF444F' : '#a1a1aa',
        fontSize: 12,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        fontWeight: drawingState.mode === mode ? 600 : 400,
      }}
      title={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Toolbar */}
      {!readOnly && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            background: 'rgba(10, 10, 15, 0.95)',
            padding: 12,
            borderRadius: 10,
            border: '1px solid rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)',
          }}
        >
          {/* Mode indicator */}
          {isDrawingMode && (
            <div style={{
              padding: '6px 10px',
              background: 'rgba(255, 68, 79, 0.15)',
              borderRadius: 6,
              fontSize: 11,
              color: '#FF444F',
              textAlign: 'center',
              fontWeight: 500,
            }}>
              Drawing Mode - Click and drag on chart
            </div>
          )}

          {/* Drawing tools */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <ToolButton
              mode={null}
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                </svg>
              }
              label="Select"
            />
            <ToolButton
              mode="trendline"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="4" y1="20" x2="20" y2="4" />
                </svg>
              }
              label="Trend"
            />
            <ToolButton
              mode="horizontal"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="4" y1="12" x2="20" y2="12" />
                </svg>
              }
              label="H-Line"
            />
            <ToolButton
              mode="rectangle"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="4" y="6" width="16" height="12" rx="1" />
                </svg>
              }
              label="Zone"
            />
            <ToolButton
              mode="arrow"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="5" y1="19" x2="19" y2="5" />
                  <polyline points="12 5 19 5 19 12" />
                </svg>
              }
              label="Arrow"
            />
            <ToolButton
              mode="text"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="4 7 4 4 20 4 20 7" />
                  <line x1="12" y1="4" x2="12" y2="20" />
                  <line x1="8" y1="20" x2="16" y2="20" />
                </svg>
              }
              label="Text"
            />
            <ToolButton
              mode="pricemarker"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v20M2 12h20" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              }
              label="Signal"
            />
          </div>

          {/* Color picker */}
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            {COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setSelectedColor(color)}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 4,
                  background: color,
                  border: selectedColor === color ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                  cursor: 'pointer',
                  boxShadow: selectedColor === color ? `0 0 8px ${color}` : 'none',
                }}
              />
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button
              onClick={deleteSelectedDrawing}
              disabled={!selectedDrawing}
              style={{
                padding: '6px 10px',
                background: 'rgba(255, 68, 79, 0.1)',
                border: '1px solid rgba(255, 68, 79, 0.3)',
                borderRadius: 4,
                color: '#FF444F',
                fontSize: 11,
                cursor: selectedDrawing ? 'pointer' : 'not-allowed',
                opacity: selectedDrawing ? 1 : 0.5,
              }}
            >
              Delete
            </button>
            <button
              onClick={clearAllDrawings}
              style={{
                padding: '6px 10px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 4,
                color: '#a1a1aa',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              Clear All
            </button>
          </div>

          {/* Drawing count */}
          <div style={{ fontSize: 10, color: '#71717a', marginTop: 2 }}>
            {drawings.length} drawing{drawings.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Chart container */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      />

      {/* Drawing overlay canvas */}
      <canvas
        ref={drawingCanvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={(e) => {
          if (drawingState.isDrawing || isDrawingRef.current) {
            handleMouseUp(e);
          }
        }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: isDrawingMode ? 'auto' : 'none',
          cursor: isDrawingMode ? 'crosshair' : 'default',
          zIndex: 9999, // Ensure canvas is on top of chart
        }}
      />

      {/* Text input popup */}
      {showTextInput && textInputPosition && (
        <div
          style={{
            position: 'fixed',
            left: textInputPosition.x,
            top: textInputPosition.y,
            zIndex: 1000,
            background: '#1a1a28',
            padding: 12,
            borderRadius: 8,
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
          }}
        >
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTextSubmit();
              if (e.key === 'Escape') {
                setShowTextInput(false);
                setPendingTextPoint(null);
                setTextInput('');
              }
            }}
            placeholder="Enter label..."
            autoFocus
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 4,
              padding: '8px 12px',
              color: '#fff',
              fontSize: 13,
              width: 200,
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              onClick={handleTextSubmit}
              style={{
                flex: 1,
                padding: '6px 12px',
                background: '#FF444F',
                border: 'none',
                borderRadius: 4,
                color: '#fff',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Add
            </button>
            <button
              onClick={() => {
                setShowTextInput(false);
                setPendingTextPoint(null);
                setTextInput('');
              }}
              style={{
                flex: 1,
                padding: '6px 12px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: 4,
                color: '#a1a1aa',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
