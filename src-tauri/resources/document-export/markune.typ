#let markune-ink = rgb("#202124")
#let markune-muted = rgb("#5f6368")
#let markune-border = rgb("#d9dde3")
#let markune-accent = rgb("#155eaa")
#let markune-surface = rgb("#f6f8fa")

#let content-to-string(content) = {
  if content.has("text") {
    content.text
  } else if content.has("children") {
    content.children.map(content-to-string).join("")
  } else if content.has("body") {
    content-to-string(content.body)
  } else if content == [ ] {
    " "
  }
}

#let conf(
  title: none,
  subtitle: none,
  authors: (),
  keywords: (),
  date: none,
  abstract-title: none,
  abstract: none,
  thanks: none,
  cols: 1,
  margin: (top: 18mm, bottom: 18mm, left: 20mm, right: 20mm),
  paper: "a4",
  lang: "zh",
  region: "CN",
  font: (
    "Source Han Serif SC",
    "Noto Serif CJK SC",
    "Songti SC",
    "SimSun",
    "STSong",
  ),
  fontsize: 10.5pt,
  mathfont: none,
  codefont: (
    "Cascadia Mono",
    "SFMono-Regular",
    "Menlo",
    "Consolas",
  ),
  linestretch: 1.35,
  sectionnumbering: none,
  linkcolor: markune-accent,
  citecolor: markune-accent,
  filecolor: markune-accent,
  pagenumbering: "1",
  doc,
) = {
  set document(
    title: title,
    keywords: keywords,
  )
  set document(
    author: authors.map(author => content-to-string(author.name)).join(", ", last: " & "),
  ) if authors != none and authors != ()

  set page(
    paper: paper,
    margin: margin,
    numbering: pagenumbering,
    columns: cols,
  )
  set par(
    justify: true,
    leading: linestretch * 0.65em,
    spacing: 0.72em,
  )
  set text(
    fill: markune-ink,
    font: font,
    lang: lang,
    region: region,
    size: fontsize,
  )
  set heading(numbering: sectionnumbering)
  set table(
    align: left,
    inset: (x: 6pt, y: 5pt),
    stroke: 0.4pt + markune-border,
  )

  show math.equation: set text(font: mathfont) if mathfont != none
  show raw: set text(font: codefont)
  show raw.where(block: true): it => block(
    above: 0.65em,
    below: 0.8em,
    breakable: true,
    fill: markune-surface,
    inset: 8pt,
    radius: 3pt,
    stroke: 0.4pt + markune-border,
    width: 100%,
  )[#set text(size: 0.88em); #it]
  show heading: set block(above: 1.05em, below: 0.5em, breakable: false)
  show heading.where(level: 1): set text(size: 1.65em, weight: "bold")
  show heading.where(level: 2): set text(size: 1.35em, weight: "bold")
  show heading.where(level: 3): set text(size: 1.16em, weight: "semibold")
  show heading.where(level: 4): set text(size: 1.04em, weight: "semibold")
  show link: set text(fill: linkcolor)
  show ref: set text(fill: citecolor)
  show link: link => {
    if filecolor != none and type(link.dest) == label {
      text(link, fill: filecolor)
    } else {
      text(link)
    }
  }

  if title != none {
    block(below: 1.5em, width: 100%)[
      #align(center)[
        #text(size: 1.8em, weight: "bold", hyphenate: false)[#title]
        #if subtitle != none { parbreak(); text(size: 1.25em)[#subtitle] }
        #if authors != none and authors != () {
          parbreak()
          text(fill: markune-muted)[
            #authors.map(author => author.name).join([, ])
          ]
        }
        #if date != none { parbreak(); text(fill: markune-muted)[#date] }
      ]
      #if thanks != none { footnote(thanks, numbering: "*") }
      #if abstract != none {
        block(above: 1em, inset: (x: 1.5em, y: 0.8em), fill: markune-surface)[
          #text(weight: "semibold")[#abstract-title] #h(0.8em) #abstract
        ]
      }
    ]
  }

  doc
}
