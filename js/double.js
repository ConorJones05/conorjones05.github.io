function getYear(dateStr) {
  return new Date(dateStr).getFullYear();
}

d3.csv("../../data/courses_by_supergenre.csv").then(raw => {
  // filter out Other
  const filtered = raw.filter(d => d.super_genre && d.super_genre !== 'Other');

  const allSubGenres = [];

  const superGenreMap = d3.rollup(
    filtered,
    v => {
      const subGenres = d3.rollup(
        v,
        vv => ({
          count: vv.length,
          avgRating: d3.mean(vv, d => +d.rating),
          avgDuration: d3.mean(vv, d => +d.duration_hours),
          years: d3.rollup(vv, arr => arr.length, d => getYear(d.created))
        }),
        d => d.genre
      );
      const subArr = Array.from(subGenres, ([genre, stats]) => ({
        genre,
        ...stats
      })).filter(sg => sg.genre !== 'Other');
      allSubGenres.push(...subArr);
      return {
        count: v.length,
        avgRating: d3.mean(v, d => +d.rating),
        avgDuration: d3.mean(v, d => +d.duration_hours),
        years: d3.rollup(v, vv => vv.length, d => getYear(d.created)),
        subGenres: subArr
      };
    },
    d => d.super_genre
  );

  const superData = Array.from(superGenreMap, ([superGenre, stats]) => ({
    superGenre,
    count: stats.count,
    avgRating: stats.avgRating,
    avgDuration: stats.avgDuration,
    years: stats.years,
    subGenres: stats.subGenres,
    expanded: false
  }));

  const colorScale = d3.scaleOrdinal()
    .domain(superData.map(d => d.superGenre))
    .range(["#5b8def", "#ef5b8d", "#8def5b", "#ef8d5b", "#8d5bef", "#5bef8d", "#ef5bef"]);

  const margin = {top: 40, right: 30, bottom: 60, left: 60},
    width = 650 - margin.left - margin.right,
    height = 500 - margin.top - margin.bottom;

  const xScale = d3.scaleLinear()
    .domain([d3.min(allSubGenres, d => d.avgDuration) * 0.8, d3.max(allSubGenres, d => d.avgDuration) * 1.1])
    .range([0, width]);
  const yScale = d3.scaleLinear()
    .domain([d3.min(allSubGenres, d => d.avgRating) * 0.98, d3.max(allSubGenres, d => d.avgRating) * 1.01]).nice()
    .range([height, 0]);
  const zScale = d3.scaleSqrt()
    .domain([0, d3.max(superData, d => d.count)])
    .range([25, 55]);
  const subZScale = d3.scaleSqrt()
    .domain([0, d3.max(allSubGenres, d => d.count)])
    .range([6, 22]);

  const svg = d3.select("#scatter_viz")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // axes
  svg.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScale).ticks(8))
    .append("text")
    .attr("x", width / 2)
    .attr("y", 45)
    .attr("fill", "#222")
    .attr("text-anchor", "middle")
    .attr("font-size", "1em")
    .text("Average Duration (hours)");

  svg.append("g")
    .call(d3.axisLeft(yScale).ticks(6))
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -45)
    .attr("fill", "#222")
    .attr("text-anchor", "middle")
    .attr("font-size", "1em")
    .text("Average Rating");

  svg.append("text")
    .attr("class", "instruction-text")
    .attr("x", width / 2)
    .attr("y", -15)
    .attr("text-anchor", "middle")
    .attr("font-size", "0.9em")
    .attr("fill", "#666")
    .text("Click a category to expand sub-genres");

  const subLayer = svg.append("g").attr("class", "sub-layer");
  const superLayer = svg.append("g").attr("class", "super-layer");

  // super-genre circles
  const superCircles = superLayer.selectAll(".super-circle")
    .data(superData)
    .join("circle")
    .attr("class", "super-circle")
    .attr("cx", d => xScale(d.avgDuration))
    .attr("cy", d => yScale(d.avgRating))
    .attr("r", d => zScale(d.count))
    .attr("fill", d => colorScale(d.superGenre))
    .attr("opacity", 0.9)
    .attr("stroke", "#333")
    .attr("stroke-width", 2.5)
    .style("cursor", "pointer")
    .on("click", function(event, d) {
      event.stopPropagation();
      toggleExpand(d);
    });

  superCircles.append("title")
    .text(d => `${d.superGenre}\n${d.count} courses\nAvg Duration: ${d.avgDuration.toFixed(1)} hrs\nAvg Rating: ${d.avgRating.toFixed(2)}\n\nClick to expand sub-genres`);

  // labels
  superLayer.selectAll(".super-label")
    .data(superData)
    .join("text")
    .attr("class", "super-label")
    .attr("x", d => xScale(d.avgDuration))
    .attr("y", d => yScale(d.avgRating))
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("font-size", "0.85em")
    .attr("font-weight", "bold")
    .attr("fill", "#fff")
    .attr("pointer-events", "none")
    .text(d => d.superGenre);

  // track expanded state
  let expandedSuper = null;

  function toggleExpand(clickedData) {
    const color = colorScale(clickedData.superGenre);
    const cx = xScale(clickedData.avgDuration);
    const cy = yScale(clickedData.avgRating);

    // collapse any expanded
    if (expandedSuper && expandedSuper !== clickedData) collapseAll();

    if (clickedData.expanded) {
      subLayer.selectAll(".sub-circle, .sub-label, .connector-line").remove();
      clickedData.expanded = false;
      expandedSuper = null;
      superCircles.attr("opacity", 0.9);
      drawTimeSeries(clickedData.superGenre, clickedData.years, color);
      return;
    }

    superCircles.attr("opacity", d => d === clickedData ? 0.9 : 0.3);

    const subNodes = clickedData.subGenres.map((sub, i) => {
      const tx = xScale(sub.avgDuration);
      const ty = yScale(sub.avgRating);
      // jitter to reduce overlap
      const angle = (i / Math.max(1, clickedData.subGenres.length)) * Math.PI * 2;
      const jitter = 6 + (subZScale(sub.count) % 8);
      return {
        ...sub,
        x: Math.max(0, Math.min(width, tx + Math.cos(angle) * jitter)),
        y: Math.max(0, Math.min(height, ty + Math.sin(angle) * jitter)),
        targetX: tx,
        targetY: ty,
        radius: subZScale(sub.count)
      };
    });

    // connector lines
    subLayer.selectAll(".connector-line")
      .data(subNodes)
      .join("line")
      .attr("class", "connector-line")
      .attr("x1", cx)
      .attr("y1", cy)
      .attr("x2", d => d.x)
      .attr("y2", d => d.y)
      .attr("stroke", color)
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3")
      .attr("opacity", 0.5);

    const subCircles = subLayer.selectAll(".sub-circle")
      .data(subNodes)
      .join("circle")
      .attr("class", "sub-circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", d => d.radius)
      .attr("fill", d3.color(color).brighter(0.3))
      .attr("stroke", d3.color(color).darker(0.5))
      .attr("stroke-width", 1.2)
      .style("cursor", "pointer")
      .on("click", function(event, sub) {
        event.stopPropagation();
        drawTimeSeries(sub.genre, sub.years, color);
      });

    subCircles.append("title")
      .text(d => `${d.genre}\n${d.count} courses\nDuration: ${d.avgDuration.toFixed(1)} hrs\nRating: ${d.avgRating.toFixed(2)}\n\nClick for time series`);

    //  under circles
    subLayer.selectAll(".sub-label")
      .data(subNodes)
      .join("text")
      .attr("class", "sub-label")
      .attr("x", d => d.x)
      .attr("y", d => d.y + d.radius + 12)
      .attr("text-anchor", "middle")
      .attr("font-size", "0.7em")
      .attr("fill", "#333")
      .text(d => d.genre.length > 15 ? d.genre.substring(0, 12) + "..." : d.genre);

    clickedData.expanded = true;
    expandedSuper = clickedData;
  }

  function collapseAll() {
    if (activeSimulation) {
      activeSimulation.stop();
      activeSimulation = null;
    }
    subLayer.selectAll(".sub-circle, .sub-label, .connector-line").remove();
    superData.forEach(d => d.expanded = false);
    superCircles.attr("opacity", 0.9);
    expandedSuper = null;
  }

  // Click on background to collapse
  svg.on("click", () => collapseAll());

  const mostPopular = superData.reduce((a, b) => a.count > b.count ? a : b);
  drawTimeSeries(mostPopular.superGenre, mostPopular.years, colorScale(mostPopular.superGenre));

  // tme Series 
  function drawTimeSeries(name, yearsMap, color) {
    d3.select("#panel_title").text(`${name} — Courses Over Time`);
    d3.select("#timeseries_viz").selectAll("*").remove();

    const tsMargin = {top: 30, right: 20, bottom: 50, left: 55},
      tsWidth = 400 - tsMargin.left - tsMargin.right,
      tsHeight = 300 - tsMargin.top - tsMargin.bottom;

    const tsSvg = d3.select("#timeseries_viz")
      .append("svg")
      .attr("width", tsWidth + tsMargin.left + tsMargin.right)
      .attr("height", tsHeight + tsMargin.top + tsMargin.bottom)
      .append("g")
      .attr("transform", `translate(${tsMargin.left},${tsMargin.top})`);

    const years = Array.from(yearsMap, ([year, count]) => ({year: +year, count}))
      .filter(d => d.year !== 2023)
      .sort((a, b) => a.year - b.year);

    const xTs = d3.scalePoint()
      .domain(years.map(d => d.year))
      .range([0, tsWidth])
      .padding(0.5);

    const yTs = d3.scaleLinear()
      .domain([0, d3.max(years, d => d.count)]).nice()
      .range([tsHeight, 0]);

    // x axis
    tsSvg.append("g")
      .attr("transform", `translate(0,${tsHeight})`)
      .call(d3.axisBottom(xTs).tickFormat(d3.format("d")))
      .selectAll("text")
      .attr("transform", "rotate(-45)")
      .attr("text-anchor", "end");

    // y axis
    tsSvg.append("g")
      .call(d3.axisLeft(yTs));

    // line
    tsSvg.append("path")
      .datum(years)
      .attr("fill", "none")
      .attr("stroke", color)
      .attr("stroke-width", 2.5)
      .attr("d", d3.line()
        .x(d => xTs(d.year))
        .y(d => yTs(d.count))
      );

    // points
    tsSvg.selectAll("circle")
      .data(years)
      .join("circle")
      .attr("fill", color)
      .attr("cx", d => xTs(d.year))
      .attr("cy", d => yTs(d.count))
      .attr("r", 5)
      .append("title")
      .text(d => `${d.year}: ${d.count} courses`);
  }
});