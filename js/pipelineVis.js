(function initPipelineVis() {
  const dataUrl = "../data/harvard_mit_mooc_clean.csv";
  const svg = d3.select("#pipelineSvg");
  const checkboxContainer = document.getElementById("checkboxContainer");
  const dimensionRadios = document.querySelectorAll("input[name='highlightBy']");
  const detailsContent = document.getElementById("detailsContent");
  const detailsHint = document.getElementById("detailsHint");

  let allRows = [];
  const categories = { gender: [], education: [] };
  let currentHighlight = "gender";
  const activeGroups = { gender: new Set(), education: new Set() };
  const colorMap = new Map();
  const palette = (d3.schemeSet2 || []).concat(d3.schemeTableau10 || []);
  let currentCurves = [];

  function getColor(dimension, value) {
    const key = `${dimension}:${value}`;
    if (!colorMap.has(key)) {
      const idx = colorMap.size % palette.length;
      colorMap.set(key, palette[idx] || "#5b8def");
    }
    return colorMap.get(key);
  }

  d3
    .csv(dataUrl, d => ({
      ndays_act: +(d.ndays_act || 0) || 0,
      gender: (d.gender_clean || "Not Specified").trim(),
      education: (d.education_clean || "Not Specified").trim(),
    }))
    .then(rows => {
      allRows = rows;
      initCategories();
      renderCheckboxes();
      renderPipelines();
      setupInteractions();
    })
    .catch(err => {
      console.error("Brken csv load", err);
    });

  function aggregateCategories(accessor) {
    const rolled = d3.rollup(allRows, v => v.length, accessor);
    return Array.from(rolled.entries())
      .filter(([k]) => k != null && k !== "")
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => d3.descending(a.count, b.count));
  }

  function initCategories() {
    categories.gender = aggregateCategories(d => d.gender);
    categories.education = aggregateCategories(d => d.education);

    Object.keys(categories).forEach(dim => {
      activeGroups[dim] = new Set(categories[dim].map(d => d.value));
    });
  }

  function renderCheckboxes() {
    checkboxContainer.innerHTML = "";
    const list = categories[currentHighlight];
    list.forEach((item, idx) => {
      const id = `chk-${currentHighlight}-${idx}`;
      const label = document.createElement("label");
      label.setAttribute("for", id);

      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = id;
      input.value = item.value;
      input.checked = activeGroups[currentHighlight].has(item.value);

      const swatch = document.createElement("span");
      swatch.className = "checkbox-swatch";
      swatch.style.background = getColor(currentHighlight, item.value);

      const text = document.createElement("span");
      text.textContent = `${item.value} (${item.count.toLocaleString()})`;

      label.appendChild(input);
      label.appendChild(swatch);
      label.appendChild(text);
      checkboxContainer.appendChild(label);

      input.addEventListener("change", () => {
        if (input.checked) {
          activeGroups[currentHighlight].add(item.value);
        } else {
          activeGroups[currentHighlight].delete(item.value);
        }
        renderPipelines();
        clearDetails();
      });
    });
  }

  function getDimensionValue(row, dim) {
    if (dim === "gender") return row.gender;
    if (dim === "education") return row.education;
    return null;
  }

  function computeCurve(rows, maxDays) {
    const days = rows
      .map(d => d.ndays_act || 0)
      .filter(d => d >= 0)
      .sort(d3.ascending);
    const n = days.length;
    if (!n) return { points: [], total: 0 };

    let idx = 0;
    const step = Math.max(1, Math.round(maxDays / 80));
    const points = [];
    for (let t = 0; t <= maxDays; t += step) {
      while (idx < n && days[idx] < t) idx++;
      const survivors = n - idx;
      const fracWithinGroup = survivors / n;
      points.push({ day: t, survivors, fracWithinGroup });
    }
    return { points, total: n };
  }

  function renderPipelines() {
    if (!allRows.length) return;

    const width = 720;
    const height = 420;
    const margin = { top: 16, right: 36, bottom: 30, left: 56 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    svg.selectAll("*").remove();
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const maxDays =
      d3.quantile(allRows, 0.98, d => d.ndays_act || 0) ||
      d3.max(allRows, d => d.ndays_act || 0) ||
      1;
    const maxTotal = allRows.length || 1;

    const yScale = d3
      .scaleLinear()
      .domain([0, maxDays])
      .range([0, innerHeight]);

    const centerX = innerWidth / 2;
    const maxWidth = innerWidth * 0.8;

    const area = d3
      .area()
      .y(d => yScale(d.day))
      .x0(d => centerX - (maxWidth * (d.survivors / maxTotal)) / 2)
      .x1(d => centerX + (maxWidth * (d.survivors / maxTotal)) / 2)
      .curve(d3.curveBasis);

    const baseCurve = computeCurve(allRows, maxDays);
    if (baseCurve.total > 0) {
      g
        .append("path")
        .datum(baseCurve.points)
        .attr("d", area)
        .attr("fill", "#f1f1f1")
        .attr("stroke", "#d0d0d0")
        .attr("stroke-width", 1.2);
    }

    const activeValues = Array.from(activeGroups[currentHighlight]);
    const groups = activeValues
      .map(value => {
        const subset = allRows.filter(d => getDimensionValue(d, currentHighlight) === value);
        return { value, subset };
      })
      .filter(gd => gd.subset.length > 0);

    currentCurves = [];

    groups.forEach((group, groupIndex) => {
      const curve = computeCurve(group.subset, maxDays);
      if (!curve.total) return;

      const color = getColor(currentHighlight, group.value);
      currentCurves.push({
        dimension: currentHighlight,
        value: group.value,
        points: curve.points,
        total: curve.total,
        color,
      });

      g
        .append("path")
        .datum(curve.points)
        .attr("class", "pipeline")
        .attr("d", area)
        .attr("fill", color)
        .attr("fill-opacity", 0.32)
        .attr("stroke", color)
        .attr("stroke-width", 1.5)
        .attr("stroke-opacity", 1);
    });

    const hoverLine = g
      .append("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("stroke", "#444")
      .attr("stroke-dasharray", "4,3")
      .attr("stroke-width", 1)
      .style("display", "none");

    g
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("fill", "transparent")
      .on("mousemove", event => {
        if (!currentCurves.length) return;
        const [, my] = d3.pointer(event, g.node());
        const clampedY = Math.max(0, Math.min(innerHeight, my));
        const day = yScale.invert(clampedY);

        hoverLine
          .attr("y1", clampedY)
          .attr("y2", clampedY)
          .style("display", "block");

        const bisector = d3.bisector(d => d.day).left;
        const stats = currentCurves
          .map(curve => {
            let idx = bisector(curve.points, day);
            idx = Math.max(0, Math.min(curve.points.length - 1, idx));
            const p = curve.points[idx];
            return {
              dimension: curve.dimension,
              value: curve.value,
              survivors: p.survivors,
              fracWithinGroup: p.fracWithinGroup || 0,
              total: curve.total,
              color: curve.color,
            };
          })
          .filter(s => s.total > 0);

        showDetailsForDay(day, stats);
      })
      .on("mouseleave", () => {
        hoverLine.style("display", "none");
        clearDetails();
      });

    g
      .append("g")
      .call(gAxis =>
        gAxis
          .call(d3.axisLeft(yScale).ticks(6))
          .call(s =>
            s
              .selectAll("text")
              .style("font-size", "10px")
          )
      )
      .selectAll("path, line")
      .attr("stroke", "#ccc");

    g
      .append("text")
      .attr("x", -40)
      .attr("y", innerHeight / 2)
      .attr("text-anchor", "middle")
      .attr("transform", `rotate(-90 -40 ${innerHeight / 2})`)
      .attr("fill", "#666")
      .style("font-size", "11px")
      .text("Days active in course");

    g
      .append("text")
      .attr("x", centerX)
      .attr("y", innerHeight + 22)
      .attr("text-anchor", "middle")
      .attr("fill", "#666")
      .style("font-size", "11px")
      .text("Wider = more people still active");
  }

  function showDetailsForDay(day, stats) {
    if (!stats || !stats.length) {
      clearDetails();
      return;
    }
    detailsHint.style.display = "none";

    const dimension = currentHighlight;
    const dimLabel = dimension === "gender" ? "Gender" : "Education level";

    const rowsHtml = stats
      .sort((a, b) => d3.descending(a.survivors, b.survivors))
      .map(s => {
        const retainedPct = (s.fracWithinGroup || 0) * 100;
        const droppedPct = 100 - retainedPct;
        return `
          <tr>
            <td style="padding:2px 6px;white-space:nowrap;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${s.color};margin-right:4px;"></span>
              ${s.value}
            </td>
            <td style="padding:2px 6px;text-align:right;">${s.survivors.toLocaleString()}</td>
            <td style="padding:2px 6px;text-align:right;">${retainedPct.toFixed(1)}%</td>
            <td style="padding:2px 6px;text-align:right;">${droppedPct.toFixed(1)}%</td>
          </tr>
        `;
      })
      .join("");

    const html = `
      <p style="margin-bottom:8px;">
        <span class="badge">Day ${day.toFixed(0)}</span>
        &nbsp;for selected ${dimLabel.toLowerCase()}s
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
        <thead>
          <tr style="color:#666;">
            <th style="text-align:left;padding:2px 6px;">${dimLabel}</th>
            <th style="text-align:right;padding:2px 6px;">Still active</th>
            <th style="text-align:right;padding:2px 6px;">Retained</th>
            <th style="text-align:right;padding:2px 6px;">Dropped</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;

    detailsContent.innerHTML = html;
  }

  function clearDetails() {
    detailsHint.style.display = "block";
    detailsContent.innerHTML = "";
  }

  function setupInteractions() {
    dimensionRadios.forEach(radio => {
      radio.addEventListener("change", () => {
        if (!radio.checked) return;
        currentHighlight = radio.value;
        renderCheckboxes();
        renderPipelines();
        clearDetails();
      });
    });
  }

})();
