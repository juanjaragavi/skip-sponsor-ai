# ECS Fargate + ALB (stub: fill VPC/subnet IDs per env)
resource "aws_ecs_cluster" "main" { name = "${var.app}-cluster" }
resource "aws_lb" "main" {
  name = "${var.app}-alb"
  load_balancer_type = "application"
  subnets = []
}
