# ZenBrain Paper — Build Commands
# Prerequisites: pdflatex, bibtex (install via MacTeX or TeX Live)
#
# Install on macOS:
#   brew install --cask mactex-no-gui
#   eval "$(/usr/libexec/path_helper)"
#
# Or use TinyTeX (lighter):
#   curl -sL "https://yihui.org/tinytex/install-bin-unix.sh" | sh

MAIN = zenbrain
LATEX = pdflatex
BIBTEX = bibtex
LATEXFLAGS = -interaction=nonstopmode -halt-on-error

.PHONY: all clean watch figures

# Full build (latex -> bibtex -> latex -> latex)
all: $(MAIN).pdf

$(MAIN).pdf: $(MAIN).tex $(MAIN).bib neurips_2025.sty
	$(LATEX) $(LATEXFLAGS) $(MAIN)
	$(BIBTEX) $(MAIN)
	$(LATEX) $(LATEXFLAGS) $(MAIN)
	$(LATEX) $(LATEXFLAGS) $(MAIN)

# Quick rebuild (single pass, no bibtex)
quick:
	$(LATEX) $(LATEXFLAGS) $(MAIN)

# Build architecture figure (standalone TikZ)
figures:
	cd figures && $(LATEX) $(LATEXFLAGS) architecture.tex

# Clean auxiliary files
clean:
	rm -f $(MAIN).aux $(MAIN).bbl $(MAIN).blg $(MAIN).log $(MAIN).out
	rm -f $(MAIN).fls $(MAIN).fdb_latexmk $(MAIN).synctex.gz
	rm -f figures/*.aux figures/*.log

# Clean everything including PDF
distclean: clean
	rm -f $(MAIN).pdf

# Word count (approximate)
wc:
	@texcount -inc -total $(MAIN).tex 2>/dev/null || echo "Install texcount: tlmgr install texcount"

# Watch for changes (requires fswatch)
watch:
	fswatch -o $(MAIN).tex $(MAIN).bib | xargs -n1 -I{} make quick
