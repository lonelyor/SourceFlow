package epub

import (
	"archive/zip"
	"encoding/xml"
	"errors"
	"io"
	"path"
	"strings"
)

type Book struct {
	Ncx       Ncx
	Opf       Opf
	Container Container
	Mimetype  string

	fd *zip.ReadCloser
}

func (p *Book) Open(n string) (io.ReadCloser, error) {
	return p.open(p.filename(n))
}

func (p *Book) Files() []string {
	var fns []string
	for _, f := range p.fd.File {
		fns = append(fns, f.Name)
	}
	return fns
}

func (p *Book) Close() {
	p.fd.Close()
}

func (p *Book) filename(n string) string {
	return path.Join(path.Dir(p.Container.Rootfile.Path), n)
}

func (p *Book) readXML(n string, v interface{}) error {
	fd, err := p.open(n)
	if err != nil {
		return nil
	}
	defer fd.Close()
	dec := xml.NewDecoder(fd)
	return dec.Decode(v)
}

func (p *Book) readBytes(n string) ([]byte, error) {
	fd, err := p.open(n)
	if err != nil {
		return nil, nil
	}
	defer fd.Close()

	return io.ReadAll(fd)

}

func (p *Book) open(n string) (io.ReadCloser, error) {
	for _, f := range p.fd.File {
		if f.Name == n {
			return f.Open()
		}
	}

	if !strings.ContainsAny(n, "-_") {
		return nil, errors.New(n + " not found")
	}

	// Improve EPUB asset file content parsing https://github.com/lonelyor/SourceFlow/issues/9072
	nn := strings.ReplaceAll(n, "-", "")
	nn = strings.ReplaceAll(nn, "_", "")
	for _, f := range p.fd.File {
		fn := strings.ReplaceAll(f.Name, "-", "")
		fn = strings.ReplaceAll(fn, "_", "")

		if fn == nn {
			return f.Open()
		}
	}
	return nil, errors.New(n + " not found")
}
