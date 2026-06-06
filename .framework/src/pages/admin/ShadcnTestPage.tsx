/**
 * @module src/pages/admin/ShadcnTestPage
 * @audience installer
 * @layer frontend-page
 * @stability testing
 *
 * Test page showcasing all shadcn/ui components with b1a0RuGWG preset.
 * Used to verify shadcn installation and theming is working correctly.
 */

import { useState } from 'react'
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  CardFooter
} from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { Checkbox } from '../../components/ui/checkbox'
import { Switch } from '../../components/ui/switch'
import { Badge } from '../../components/ui/badge'
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../components/ui/accordion'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/dialog'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '../../components/ui/alert'
import { Separator } from '../../components/ui/separator'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui/tabs'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../../components/ui/breadcrumb'
import { ScrollArea } from '../../components/ui/scroll-area'
import { Skeleton } from '../../components/ui/skeleton'
import { Progress } from '../../components/ui/progress'
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import { Textarea } from '../../components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group'
import { Slider } from '../../components/ui/slider'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'
import { 
  Bell, 
  Check, 
  ChevronRight, 
  Mail, 
  Settings, 
  User, 
  Plus,
  Search,
  MoreHorizontal,
  Calendar as CalendarIcon,
  AlertCircle,
  Info
} from 'lucide-react'
import { cn } from '../../lib/utils'

export function ShadcnTestPage() {
  const [date, setDate] = useState<Date>()
  const [progress, setProgress] = useState(68)
  const [sliderValue, setSliderValue] = useState([50])
  
  // Simple date formatter since date-fns is not available
  const formatDate = (date: Date | undefined) => {
    if (!date) return 'Pick a date'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <TooltipProvider>
      <div className="flex-1 space-y-6 p-8 pt-6">
        {/* Header with Breadcrumb */}
        <div className="space-y-2">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/dashboard">Spine</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/spine-framework/admin">Admin</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>UI Test</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">shadcn/ui Test Page</h1>
              <p className="text-muted-foreground">
                Verifying b1a0RuGWG preset installation and component theming
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Bell className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Notifications</p>
                </TooltipContent>
              </Tooltip>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Settings className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Settings</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Profile</DropdownMenuItem>
                  <DropdownMenuItem>Preferences</DropdownMenuItem>
                  <DropdownMenuItem>Logout</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Item
              </Button>
            </div>
          </div>
        </div>

        <Separator />

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Cards Section */}
          <Card>
            <CardHeader>
              <CardTitle>Card Components</CardTitle>
              <CardDescription>Various card layouts and styles</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="p-4">
                    <CardTitle className="text-sm">Simple Card</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <p className="text-sm text-muted-foreground">Basic card content</p>
                  </CardContent>
                </Card>
                
                <Card className="bg-primary text-primary-foreground">
                  <CardHeader className="p-4">
                    <CardTitle className="text-sm">Themed Card</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <p className="text-sm opacity-90">Primary themed card</p>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          {/* Form Components */}
          <Card>
            <CardHeader>
              <CardTitle>Form Controls</CardTitle>
              <CardDescription>Inputs, selects, and checkboxes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" placeholder="Enter email..." />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="role">Role</Label>
                <Select>
                  <SelectTrigger id="role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="guest">Guest</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea id="bio" placeholder="Tell us about yourself..." />
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox id="terms" />
                <label
                  htmlFor="terms"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Accept terms and conditions
                </label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch id="notifications" />
                <Label htmlFor="notifications">Enable notifications</Label>
              </div>
            </CardContent>
          </Card>

          {/* Badges & Alerts */}
          <Card>
            <CardHeader>
              <CardTitle>Badges & Alerts</CardTitle>
              <CardDescription>Status indicators and messages</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge>Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="destructive">Destructive</Badge>
                <Badge variant="outline">Outline</Badge>
              </div>
              
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Information</AlertTitle>
                <AlertDescription>
                  This is an informational alert with an icon.
                </AlertDescription>
              </Alert>
              
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  Something went wrong! This is a destructive alert.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Progress & Slider */}
          <Card>
            <CardHeader>
              <CardTitle>Progress & Sliders</CardTitle>
              <CardDescription>Visual indicators and range inputs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <Label>Progress</Label>
                  <span className="text-muted-foreground">{progress}%</span>
                </div>
                <Progress value={progress} />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setProgress(Math.max(0, progress - 10))}>-10</Button>
                  <Button size="sm" variant="outline" onClick={() => setProgress(Math.min(100, progress + 10))}>+10</Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <Label>Slider</Label>
                  <span className="text-muted-foreground">{sliderValue[0]}</span>
                </div>
                <Slider
                  value={sliderValue}
                  onValueChange={setSliderValue}
                  max={100}
                  step={1}
                />
              </div>
            </CardContent>
          </Card>

          {/* Table Component */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Table Component</CardTitle>
              <CardDescription>Data display with shadcn table primitives</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableCaption>A list of recent test items</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">001</TableCell>
                    <TableCell>Test Item 1</TableCell>
                    <TableCell><Badge variant="default">Active</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">Edit</Button>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">002</TableCell>
                    <TableCell>Test Item 2</TableCell>
                    <TableCell><Badge variant="secondary">Pending</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">Edit</Button>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">003</TableCell>
                    <TableCell>Test Item 3</TableCell>
                    <TableCell><Badge variant="destructive">Error</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">Edit</Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Tabs Component */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Tabs Component</CardTitle>
              <CardDescription>Content organization with tabs</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="account" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="account">Account</TabsTrigger>
                  <TabsTrigger value="password">Password</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>
                <TabsContent value="account" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input id="username" defaultValue="@johndoe" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" defaultValue="John Doe" />
                  </div>
                </TabsContent>
                <TabsContent value="password" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="current">Current Password</Label>
                    <Input id="current" type="password" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new">New Password</Label>
                    <Input id="new" type="password" />
                  </div>
                </TabsContent>
                <TabsContent value="settings" className="space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Email Notifications</Label>
                        <p className="text-sm text-muted-foreground">Receive emails about your account</p>
                      </div>
                      <Switch />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Marketing Emails</Label>
                        <p className="text-sm text-muted-foreground">Receive marketing emails</p>
                      </div>
                      <Switch />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Dialog & Popover */}
          <Card>
            <CardHeader>
              <CardTitle>Dialog & Popover</CardTitle>
              <CardDescription>Modal dialogs and floating content</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">Open Dialog</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Test Dialog</DialogTitle>
                    <DialogDescription>
                      This is a modal dialog using shadcn Dialog component.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <p className="text-sm text-muted-foreground">
                      Dialogs are great for confirmations, forms, and alerts.
                    </p>
                  </div>
                </DialogContent>
              </Dialog>

              <Button variant="outline" onClick={() => setDate(new Date())}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {formatDate(date)}
              </Button>
            </CardContent>
          </Card>

          {/* Accordion */}
          <Card>
            <CardHeader>
              <CardTitle>Accordion</CardTitle>
              <CardDescription>Collapsible content sections</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger>Is it accessible?</AccordionTrigger>
                  <AccordionContent>
                    Yes. It adheres to the WAI-ARIA design pattern.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                  <AccordionTrigger>Is it styled?</AccordionTrigger>
                  <AccordionContent>
                    Yes. It comes with default styles that match the other components.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-3">
                  <AccordionTrigger>Is it animated?</AccordionTrigger>
                  <AccordionContent>
                    Yes. It has smooth animations powered by Radix UI.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          {/* Avatar & Skeleton */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Avatars & Skeletons</CardTitle>
              <CardDescription>User representations and loading states</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-4">
                  <Avatar>
                    <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
                    <AvatarFallback>CN</AvatarFallback>
                  </Avatar>
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">@shadcn</p>
                    <p className="text-sm text-muted-foreground">shadcn@example.com</p>
                  </div>
                </div>
                
                <Separator orientation="vertical" className="h-12" />
                
                <div className="flex items-center gap-4">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-[250px]" />
                    <Skeleton className="h-4 w-[200px]" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Radio Group */}
          <Card>
            <CardHeader>
              <CardTitle>Radio Group</CardTitle>
              <CardDescription>Single selection from multiple options</CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup defaultValue="comfortable" className="grid gap-4">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="default" id="r1" />
                  <Label htmlFor="r1">Default</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="comfortable" id="r2" />
                  <Label htmlFor="r2">Comfortable</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="compact" id="r3" />
                  <Label htmlFor="r3">Compact</Label>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>

          {/* Scroll Area */}
          <Card>
            <CardHeader>
              <CardTitle>Scroll Area</CardTitle>
              <CardDescription>Custom scrollable container</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-48 w-full rounded-md border p-4">
                <div className="space-y-4">
                  <p className="text-sm">This is a scrollable area with custom styling.</p>
                  <p className="text-sm">It can contain any content and will show a custom scrollbar.</p>
                  <p className="text-sm">More content...</p>
                  <p className="text-sm">Even more content...</p>
                  <p className="text-sm">And even more...</p>
                  <p className="text-sm">Keep scrolling...</p>
                  <p className="text-sm">Almost there...</p>
                  <p className="text-sm">You reached the end!</p>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <Separator />
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p>shadcn/ui Test Page • b1a0RuGWG Preset</p>
          <p>54 components installed</p>
        </div>
      </div>
    </TooltipProvider>
  )
}
