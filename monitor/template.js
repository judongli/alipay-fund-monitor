// 生成 dashboard.html(数据内联,浏览器直接打开即可)
module.exports = function (out) {
    const data = JSON.stringify(out);
    return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
        '<title>支付宝基金持仓</title>\n<style>\n' +
        ':root{--bg:#f6f4ef;--paper:#fffdf8;--ink:#1c1a17;--muted:#8b857b;--faint:#b8b1a6;' +
        '--line:#e7e1d4;--gain:#c0392b;--loss:#2e8b57;--accent:#1c1a17;--tag:#efe9dc;--tagink:#7a7368}\n' +
        '*{box-sizing:border-box}\n' +
        'body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,"PingFang SC","Segoe UI",system-ui,sans-serif;' +
        '-webkit-font-smoothing:antialiased;padding:32px 20px 80px}\n' +
        '.wrap{max-width:1080px;margin:0 auto}\n' +
        'header.top{display:flex;align-items:baseline;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:18px;margin-bottom:28px}\n' +
        'header.top h1{margin:0;font-size:15px;font-weight:600;letter-spacing:.04em}\n' +
        'header.top .meta{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}\n' +
        // hero
        '.hero{display:flex;align-items:flex-end;gap:28px;flex-wrap:wrap;margin-bottom:8px}\n' +
        '.hero .label{font-size:12px;color:var(--muted);letter-spacing:.18em;text-transform:uppercase;margin-bottom:8px}\n' +
        '.hero .total{font-family:Georgia,"Songti SC",serif;font-size:64px;line-height:1;font-weight:400;letter-spacing:-.02em;font-variant-numeric:tabular-nums}\n' +
        '.hero .yest{display:flex;flex-direction:column;gap:4px;padding-bottom:10px}\n' +
        '.hero .yest .v{font-size:22px;font-weight:600;font-variant-numeric:tabular-nums}\n' +
        '.gain{color:var(--gain)}.loss{color:var(--loss)}.zero{color:var(--muted)}\n' +
        // stats
        '.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:26px 0 30px}\n' +
        '.stat{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:16px 18px}\n' +
        '.stat .k{font-size:12px;color:var(--muted);margin-bottom:8px}\n' +
        '.stat .v{font-size:22px;font-weight:600;font-variant-numeric:tabular-nums}\n' +
        // controls
        '.bar{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}\n' +
        '.bar input{flex:1;min-width:180px;padding:9px 13px;border:1px solid var(--line);border-radius:8px;background:var(--paper);font-size:14px;color:var(--ink);outline:none}\n' +
        '.bar input:focus{border-color:var(--ink)}\n' +
        '.sorts{display:flex;gap:6px}\n' +
        '.sorts button{border:1px solid var(--line);background:var(--paper);color:var(--muted);padding:7px 12px;border-radius:7px;font-size:13px;cursor:pointer;font-family:inherit}\n' +
        '.sorts button.active{background:var(--ink);color:#fff;border-color:var(--ink)}\n' +
        // table
        'table{width:100%;border-collapse:collapse;background:var(--paper);border:1px solid var(--line);border-radius:10px;overflow:hidden}\n' +
        'th,td{text-align:right;padding:11px 14px;font-variant-numeric:tabular-nums;font-size:14px}\n' +
        'th:first-child,td:first-child{text-align:left}\n' +
        'th{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600;border-bottom:1px solid var(--line);background:#fbf9f3;cursor:pointer;user-select:none;white-space:nowrap}\n' +
        'th:hover{color:var(--ink)}\n' +
        'td{border-bottom:1px solid var(--line)}\n' +
        'tbody tr:last-child td{border-bottom:none}\n' +
        'tbody tr:hover{background:#fbf9f3}\n' +
        '.nm{font-weight:500}.nm b{font-weight:600}\n' +
        '.tags{display:inline-flex;gap:4px;margin-top:3px}\n' +
        '.tag{font-size:10px;background:var(--tag);color:var(--tagink);padding:1px 6px;border-radius:4px;letter-spacing:.03em}\n' +
        '.empty{padding:40px;text-align:center;color:var(--muted)}\n' +
        'footer{margin-top:24px;font-size:12px;color:var(--faint);text-align:center;line-height:1.7}\n' +
        '@media(max-width:680px){.hero .total{font-size:46px}.stats{grid-template-columns:repeat(2,1fr)}th,td{padding:9px 8px;font-size:12.5px}}\n' +
        '</style>\n</head>\n<body>\n<div class="wrap">\n' +
        '<header class="top"><h1>支付宝 · 基金持仓</h1><div class="meta" id="meta"></div></header>\n' +
        '<div class="hero"><div><div class="label">总金额</div><div class="total" id="total"></div></div>' +
        '<div class="yest"><div class="label">昨日收益</div><div class="v" id="yest"></div></div></div>\n' +
        '<div class="stats" id="stats"></div>\n' +
        '<div class="bar"><input id="q" placeholder="筛选基金名称…" autocomplete="off"><div class="sorts" id="sorts"></div></div>\n' +
        '<table><thead><tr>' +
        '<th data-k="name">名称</th><th data-k="amount">持有金额</th><th data-k="yesterday">昨日收益</th>' +
        '<th data-k="holding">持有收益</th><th data-k="rate">收益率</th></tr></thead>' +
        '<tbody id="rows"></tbody></table>\n' +
        '<footer id="foot"></footer>\n</div>\n' +
        '<script>\n' +
        'const D=' + data + ';\n' +
        'const fmt=n=>"¥"+(n||0).toLocaleString("zh-CN",{minimumFractionDigits:2,maximumFractionDigits:2});\n' +
        'const sgn=n=>(n>0?"+":(n<0?"−":""))+fmt(Math.abs(n||0));\n' +
        'const pct=r=>(r>=0?"+":"−")+(Math.abs(r)*100).toFixed(2)+"%";\n' +
        'const cls=n=>n>0?"gain":(n<0?"loss":"zero");\n' +
        'const col=val=>{const d=new Date(val);const p=n=>String(n).padStart(2,"0");return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+" "+p(d.getHours())+":"+p(d.getMinutes());};\n' +
        'document.getElementById("meta").textContent="更新于 "+col(D.ts);\n' +
        'document.getElementById("total").textContent=fmt(D.hdr.total);\n' +
        'const y=D.hdr.yProfit;const ye=document.getElementById("yest");ye.textContent=sgn(y);ye.className="v "+cls(y);\n' +
        // stats
        'const s=document.getElementById("stats");const st=[["昨日收益",D.hdr.yProfit],["持有收益",D.hdr.hProfit],["累计收益",D.hdr.cProfit],["买入待确认",D.hdr.pending]];' +
        's.innerHTML=st.map(function(x){return"<div class=\\"stat\\"><div class=\\"k\\">"+x[0]+(x[0]==="买入待确认"?"":"(元)")+"</div><div class=\\"v "+cls(x[1])+"\\">"+sgn(x[1]).replace("¥","¥")+"</div></div>";}).join("");\n' +
        // sort
        'let sortKey="amount",sortDir=-1,query="";\n' +
        'const sk=document.getElementById("sorts");\n' +
        '[["amount","金额"],["yesterday","昨日"],["holding","持有"],["rate","收益率"],["name","名称"]].forEach(function(b){const e=document.createElement("button");e.textContent=b[1];e.dataset.k=b[0];e.onclick=function(){sortKey=b[0];sortDir=-1;render();};sk.appendChild(e);});\n' +
        'document.getElementById("q").oninput=function(e){query=e.target.value.toLowerCase();render();};\n' +
        // header sort
        'Array.prototype.forEach.call(document.querySelectorAll("th"),function(th){th.onclick=function(){sortKey=th.dataset.k;render();};});\n' +
        'function render(){\n' +
        'Array.prototype.forEach.call(document.querySelectorAll(".sorts button"),function(b){b.className=b.dataset.k===sortKey?"active":"";});\n' +
        'const rows=D.funds.slice().filter(function(f){return !query||f.name.toLowerCase().indexOf(query)>=0;});\n' +
        'rows.sort(function(a,b){let x=a[sortKey],y=b[sortKey];if(sortKey==="name"){return sortDir*x.localeCompare(y);}return sortDir*(x-y);});\n' +
        'const tb=document.getElementById("rows");\n' +
        'if(!rows.length){tb.innerHTML="<tr><td colspan=\\\"5\\\" class=\\\"empty\\\">没有匹配的基金</td></tr>";}\n' +
        'tb.innerHTML=rows.map(function(f){var tags="";if(f.jinxuan)tags+="<span class=\\\"tag\\">金选</span>";if(f.autoInvest)tags+="<span class=\\\"tag\\\">定投</span>";' +
        'return "<tr><td><div class=\\"nm\\"><b>"+f.name+"</b></div>"+(tags?"<div class=\\"tags\\">"+tags+"</div>":"")+"</td>"+' +
        '"<td>"+fmt(f.amount)+"</td>"+' +
        '"<td class=\\""+cls(f.yesterday)+"\\">"+sgn(f.yesterday)+"</td>"+' +
        '"<td class=\\""+cls(f.holding)+"\\">"+sgn(f.holding)+"</td>"+' +
        '"<td class=\\""+cls(f.rate)+"\\">"+pct(f.rate)+"</td></tr>";}).join("");\n' +
        '}\n' +
        'render();\n' +
        'document.getElementById("foot").innerHTML="共 <b>"+D.count+"</b> 只基金 · 金额合计 <b>"+fmt(D.sumCheck)+"</b> · 与页面总金额差额 "+(D.diff===0?"<b class=\\"gain\\">0.00 ✓</b>":fmt(D.diff))+"<br>数据来源:支付宝「基金·持有」页 · 仅读取,不涉及交易 · ";\n' +
        '</script>\n</body>\n</html>';
};
