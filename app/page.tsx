import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PageLayout } from "@/components/page-layout"
import { StatsSection } from "@/components/stats-section"

export default function Home() {
  return (
    <PageLayout>
      <section className="py-12 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-12 xl:grid-cols-2">
            <div className="flex flex-col justify-center space-y-4">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl">
                  Share & Borrow Items Within Your Community
                </h1>
                <p className="max-w-[600px] text-muted-foreground md:text-xl">
                  Baulera is a web3 platform that enables sharing and borrowing physical items within your community
                  using blockchain for secure, transparent transactions.
                </p>
              </div>
              <div className="flex flex-col gap-2 min-[400px]:flex-row">
                <Button asChild size="lg">
                  <Link href="/login">Get Started</Link>
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <Link href="#how-it-works">Learn More</Link>
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-center">
              <div className="relative h-[350px] w-[350px] border border-border rounded-lg overflow-hidden">
                <div className="absolute inset-0 bg-muted flex items-center justify-center text-muted-foreground">
                  Community Sharing Illustration
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <StatsSection />

      <section id="how-it-works" className="py-12 md:py-24 lg:py-32 bg-muted">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">How It Works</h2>
              <p className="max-w-[900px] text-muted-foreground md:text-xl">
                Baulera makes it easy to share and borrow items in your community.
              </p>
            </div>
          </div>
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 py-12 md:grid-cols-3">
            <div className="flex flex-col items-center space-y-2 border p-6 rounded-lg bg-background">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border">1</div>
              <h3 className="text-xl font-bold">List Your Items</h3>
              <p className="text-center text-muted-foreground">
                Add items you're willing to share with your community.
              </p>
            </div>
            <div className="flex flex-col items-center space-y-2 border p-6 rounded-lg bg-background">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border">2</div>
              <h3 className="text-xl font-bold">Browse & Request</h3>
              <p className="text-center text-muted-foreground">Find items you need and request to borrow them.</p>
            </div>
            <div className="flex flex-col items-center space-y-2 border p-6 rounded-lg bg-background">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border">3</div>
              <h3 className="text-xl font-bold">Secure Transactions</h3>
              <p className="text-center text-muted-foreground">Blockchain ensures transparent and secure borrowing.</p>
            </div>
          </div>
        </div>
      </section>
    </PageLayout>
  )
}
